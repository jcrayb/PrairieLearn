import { z } from 'zod';

import * as namedLocks from '@prairielearn/named-locks';
import * as sqldb from '@prairielearn/postgres';

import { chalk, chalkDim } from '../lib/chalk.js';
import { config } from '../lib/config.js';
import { IdSchema } from '../lib/db-types.js';
import { getLockNameForCoursePath, selectOrInsertCourseByPath } from '../models/course.js';
import { flushElementCache } from '../question-servers/freeform.js';

import * as courseDB from './course-db.js';
import * as syncAssessmentModules from './fromDisk/assessmentModules.js';
import * as syncAssessmentSets from './fromDisk/assessmentSets.js';
import * as syncAssessments from './fromDisk/assessments.js';
import * as syncCourseInfo from './fromDisk/courseInfo.js';
import * as syncCourseInstances from './fromDisk/courseInstances.js';
import * as syncQuestions from './fromDisk/questions.js';
import * as syncTags from './fromDisk/tags.js';
import * as syncTopics from './fromDisk/topics.js';
import { makePerformance } from './performance.js';

const perf = makePerformance('sync');
const sql = sqldb.loadSqlEquiv(import.meta.url);

// Performance data can be logged by setting the `PROFILE_SYNC` environment variable

export interface SyncResults {
  hardFail: boolean;
  hadJsonErrors: boolean;
  hadJsonErrorsOrWarnings: boolean;
  courseId: string;
  courseData: courseDB.CourseData;
}

interface Logger {
  info: (msg: string) => void;
  verbose: (msg: string) => void;
}

export async function syncDiskToSqlWithLock(
  courseId: string,
  courseDir: string,
  logger: Logger,
): Promise<SyncResults> {
  logger.info('Loading info.json files from course repository');
  perf.start('sync');

  const courseData = await perf.timed('loadCourseData', () =>
    courseDB.loadFullCourse(courseId, courseDir),
  );

  if (config.checkSharingOnSync) {
    const sharedQuestions = await sqldb.queryRows(
      sql.select_shared_questions,
      { course_id: courseId },
      z.object({
        id: IdSchema,
        qid: z.string(),
      }),
    );
    const invalidRenames: string[] = [];
    sharedQuestions.forEach((question) => {
      if (!courseData.questions[question.qid]) {
        invalidRenames.push(question.qid);
      }
    });
    if (invalidRenames.length > 0) {
      logger.info(
        chalk.red(
          `✖ Course sync completely failed. Not allowed to move or rename shared Questions. Shared questions that were moved or renamed: ${invalidRenames.join(', ')}`,
        ),
      );
      perf.end('sync');
      const courseDataHasErrors = courseDB.courseDataHasErrors(courseData);
      const courseDataHasErrorsOrWarnings = courseDB.courseDataHasErrorsOrWarnings(courseData);
      return {
        hardFail: true,
        hadJsonErrors: courseDataHasErrors,
        hadJsonErrorsOrWarnings: courseDataHasErrorsOrWarnings,
        courseId,
        courseData,
      };
    }
  }

  logger.info('Syncing info to database');
  await perf.timed('syncCourseInfo', () => syncCourseInfo.sync(courseData, courseId));
  const courseInstanceIds = await perf.timed('syncCourseInstances', () =>
    syncCourseInstances.sync(courseId, courseData),
  );
  await perf.timed('syncTopics', () => syncTopics.sync(courseId, courseData));
  const questionIds = await perf.timed('syncQuestions', () =>
    syncQuestions.sync(courseId, courseData),
  );

  await perf.timed('syncTags', () => syncTags.sync(courseId, courseData, questionIds));
  await perf.timed('syncAssessmentSets', () => syncAssessmentSets.sync(courseId, courseData));
  await perf.timed('syncAssessmentModules', () => syncAssessmentModules.sync(courseId, courseData));
  perf.start('syncAssessments');
  await Promise.all(
    Object.entries(courseData.courseInstances).map(async ([ciid, courseInstanceData]) => {
      const courseInstanceId = courseInstanceIds[ciid];
      await perf.timed(`syncAssessments${ciid}`, () =>
        syncAssessments.sync(courseId, courseInstanceId, courseInstanceData, questionIds),
      );
    }),
  );
  perf.end('syncAssessments');
  if (config.devMode) {
    logger.info('Flushing course element and extensions cache...');
    flushElementCache();
  }
  const courseDataHasErrors = courseDB.courseDataHasErrors(courseData);
  const courseDataHasErrorsOrWarnings = courseDB.courseDataHasErrorsOrWarnings(courseData);
  if (courseDataHasErrors) {
    logger.info(chalk.red('✖ Some JSON files contained errors and were unable to be synced'));
  } else if (courseDataHasErrorsOrWarnings) {
    logger.info(
      chalk.yellow('⚠ Some JSON files contained warnings but all were successfully synced'),
    );
  } else {
    logger.info(chalk.green('✓ Course sync successful'));
  }

  // Note that we deliberately log warnings/errors after syncing to the database
  // since in some cases we actually discover new warnings/errors during the
  // sync process. For instance, we don't actually validate exam UUIDs or qids of
  // questions imported from other courses until the database sync step.
  courseDB.writeErrorsAndWarningsForCourseData(courseId, courseData, (line) =>
    logger.info(line || ''),
  );

  perf.end('sync');
  return {
    hardFail: false,
    hadJsonErrors: courseDataHasErrors,
    hadJsonErrorsOrWarnings: courseDataHasErrorsOrWarnings,
    courseId,
    courseData,
  };
}

export async function syncDiskToSql(
  course_id: string,
  courseDir: string,
  logger: Logger,
): Promise<SyncResults> {
  const lockName = getLockNameForCoursePath(courseDir);
  logger.verbose(chalkDim(`Trying lock ${lockName}`));
  const result = await namedLocks.doWithLock(
    lockName,
    {
      timeout: 0,
      onNotAcquired: () => {
        logger.verbose(chalk.red(`Did not acquire lock ${lockName}`));
        throw new Error(`Another user is already syncing or modifying the course: ${courseDir}`);
      },
    },
    async () => {
      logger.verbose(chalkDim(`Acquired lock ${lockName}`));
      return await syncDiskToSqlWithLock(course_id, courseDir, logger);
    },
  );

  logger.verbose(chalkDim(`Released lock ${lockName}`));
  return result;
}

export async function syncOrCreateDiskToSql(
  courseDir: string,
  logger: Logger,
): Promise<SyncResults> {
  const course = await selectOrInsertCourseByPath(courseDir);
  return await syncDiskToSql(course.id, courseDir, logger);
}
