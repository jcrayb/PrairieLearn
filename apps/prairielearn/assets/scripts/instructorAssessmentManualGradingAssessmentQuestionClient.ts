import { onDocumentReady } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import { EditQuestionPointsScoreButton } from '../../src/components/EditQuestionPointsScore.html.js';
import type { User } from '../../src/lib/db-types.js';
import { formatPoints } from '../../src/lib/format.js';
import type { InstanceQuestionRow } from '../../src/pages/instructorAssessmentManualGrading/assessmentQuestion/assessmentQuestion.html.js';

onDocumentReady(() => {
  const {
    hasCourseInstancePermissionEdit,
    urlPrefix,
    assessmentId,
    assessmentQuestionId,
    maxPoints,
    groupWork,
    maxAutoPoints,
  } = document.getElementById('grading-table')?.dataset ?? {};

  document.querySelectorAll<HTMLFormElement>('form[name=grading-form]').forEach((form) => {
    form.addEventListener('submit', ajaxSubmit);
  });

  // @ts-expect-error The BootstrapTableOptions type does not handle extensions properly
  $('#grading-table').bootstrapTable({
    classes: 'table table-sm table-bordered',
    url: `${urlPrefix}/assessment/${assessmentId}/manual_grading/assessment_question/${assessmentQuestionId}/instances.json`,
    dataField: 'instance_questions',
    escape: true,
    uniqueId: 'id',
    idField: 'id',
    selectItemName: 'instance_question_id',
    showButtonText: true,
    showColumns: true,
    showRefresh: true,
    autoRefresh: true,
    autoRefreshStatus: false,
    autoRefreshInterval: 30,
    buttonsOrder: ['columns', 'refresh', 'autoRefresh', 'showStudentInfo', 'status'],
    theadClasses: 'thead-light',
    stickyHeader: true,
    filterControl: true,
    rowStyle: (row) => (row.requires_manual_grading ? {} : { classes: 'text-muted bg-light' }),
    buttons: {
      showStudentInfo: {
        text: 'Show student info',
        icon: 'fa-eye',
        event: () => {
          const button = document.getElementById('js-show-student-info-button');
          $('#grading-table').bootstrapTable(
            button?.classList.contains('active') ? 'hideColumn' : 'showColumn',
            ['user_or_group_name', 'uid'],
          );
          button?.classList.toggle('active');
        },
        attributes: {
          id: 'js-show-student-info-button',
          title: 'Show/hide student identification information',
        },
      },
      status: {
        text: 'Tag for grading',
        icon: 'fa-tags',
        render: hasCourseInstancePermissionEdit === 'true',
        html: gradingTagDropdown,
      },
    },
    onUncheck: updateGradingTagButton,
    onUncheckAll: updateGradingTagButton,
    onUncheckSome: updateGradingTagButton,
    onCheck: updateGradingTagButton,
    onCheckAll: updateGradingTagButton,
    onCheckSome: updateGradingTagButton,
    onCreatedControls: () => {
      $('#grading-table th[data-field="points"] .filter-control input').tooltip({
        title: `hint: use <code>&lt;${Math.ceil(Number(maxPoints) / 2)}</code>, or <code>&gt;0</code>`,
        html: true,
      });
      $('#grading-table th[data-field="score_perc"] .filter-control input').tooltip({
        title: 'hint: use <code>&lt;50</code>, or <code>&gt;0</code>',
        html: true,
      });
    },
    onPreBody: () => {
      $('#grading-table [data-toggle="popover"]').popover('dispose');
      $('#grading-table [data-toggle="tooltip"]').tooltip('dispose');
    },
    onPostBody: () => {
      updateGradingTagButton();
      $('#grading-table [data-toggle="popover"]')
        .popover({ sanitize: false })
        .on('shown.bs.popover', updatePointsPopoverHandlers);
      $('#grading-table [data-toggle=tooltip]').tooltip({ html: true });
    },
    columns: [
      [
        { checkbox: true },
        {
          field: 'index',
          title: 'Instance',
          searchable: false,
          sortable: true,
          switchable: false,
          formatter: (_value: number, row: InstanceQuestionRow) =>
            html`<a
                href="${urlPrefix}/assessment/${assessmentId}/manual_grading/instance_question/${row.id}"
              >
                Instance ${row.index}
                ${row.open_issue_count
                  ? html`<span class="badge badge-pill badge-danger">${row.open_issue_count}</span>`
                  : ''}
              </a>
              ${row.assessment_open
                ? html`<span title="Assessment instance is still open" data-toggle="tooltip"
                    ><i class="fas fa-exclamation-triangle text-warning"></i
                  ></span>`
                : ''}`.toString(),
        },
        {
          field: 'user_or_group_name',
          title: groupWork === 'true' ? 'Group Name' : 'Name',
          searchable: true,
          filterControl: 'input',
          sortable: true,
          visible: false,
        },
        {
          field: 'uid',
          title: groupWork === 'true' ? 'UIDs' : 'UID',
          searchable: true,
          filterControl: 'input',
          sortable: true,
          visible: false,
        },
        {
          field: 'requires_manual_grading',
          title: 'Grading status',
          filterControl: 'select',
          sortable: true,
          class: 'text-center',
          formatter: (value: boolean) => (value ? 'Requires grading' : 'Graded'),
        },
        {
          field: 'assigned_grader',
          title: 'Assigned grader',
          filterControl: 'select',
          formatter: (_value: string, row: InstanceQuestionRow) => row.assigned_grader_name || '—',
        },
        {
          field: 'auto_points',
          title: 'Auto points',
          class: 'text-center',
          filterControl: 'input',
          visible: Number(maxAutoPoints) > 0,
          searchFormatter: false,
          sortable: true,
          formatter: pointsFormatter,
        },
        {
          field: 'manual_points',
          title: 'Manual points',
          class: 'text-center',
          filterControl: 'input',
          visible: true,
          searchFormatter: false,
          sortable: true,
          formatter: pointsFormatter,
        },
        {
          field: 'points',
          title: 'Total points',
          class: 'text-center',
          filterControl: 'input',
          visible: false,
          searchFormatter: false,
          sortable: true,
          formatter: pointsFormatter,
        },
        {
          field: 'score_perc',
          title: 'Percentage score',
          class: 'text-center align-middle text-nowrap',
          filterControl: 'input',
          searchFormatter: false,
          sortable: true,
          formatter: scorebarFormatter,
        },
        {
          field: 'last_grader',
          title: 'Graded by',
          filterControl: 'select',
          formatter: (value: string, row: InstanceQuestionRow) =>
            value ? row.last_grader_name : '&mdash;',
        },
      ],
    ],
  });
});

async function ajaxSubmit(this: HTMLFormElement, e: SubmitEvent) {
  e.preventDefault();

  const postBody = new URLSearchParams(new FormData(this, e.submitter) as any);

  const response = await fetch(this.action, { method: 'POST', body: postBody }).catch(
    (err) => ({ status: null, statusText: err.toString() }) as const,
  );
  if (response.status !== 200) {
    console.error(response.status, response.statusText);
    // TODO Better user notification of update failure
    return;
  }
  return await response.json();
}

async function pointsFormEventListener(this: HTMLFormElement, event: SubmitEvent) {
  const data = await ajaxSubmit.call(this, event);
  if (data.conflict_grading_job_id) {
    $('#grading-conflict-modal')
      .find('a.conflict-details-link')
      .attr('href', data.conflict_details_url);
    $('#grading-conflict-modal').modal({});
  }
  $('#grading-table').bootstrapTable('refresh');
}

function updatePointsPopoverHandlers(this: Element) {
  document.querySelectorAll<HTMLFormElement>('form[name=edit-points-form]').forEach((form) => {
    // Ensures that, if two popovers are open at the same time, the event listener is not added twice
    form.removeEventListener('submit', pointsFormEventListener);
    form.addEventListener('submit', pointsFormEventListener);
  });
}

function gradingTagDropdown() {
  const courseStaff: User[] =
    JSON.parse(document.getElementById('grading-table')?.dataset.courseStaff ?? '[]') || [];

  return html`
    <div class="dropdown btn-group">
      <button
        class="btn btn-secondary dropdown-toggle grading-tag-button"
        data-toggle="dropdown"
        name="status"
        disabled
      >
        <i class="fas fa-tags"></i> Tag for grading
      </button>
      <div class="dropdown-menu dropdown-menu-right">
        <div class="dropdown-header">Assign for grading</div>
        ${courseStaff.map(
          (grader) => html`
            <button
              class="dropdown-item"
              type="submit"
              name="batch_action_data"
              value="${JSON.stringify({
                requires_manual_grading: true,
                assigned_grader: grader.user_id,
              })}"
            >
              <i class="fas fa-user-tag"></i>
              Assign to: ${grader.name || ''} (${grader.uid})
            </button>
          `,
        )}
        <button
          class="dropdown-item"
          type="submit"
          name="batch_action_data"
          value="${JSON.stringify({ assigned_grader: null })}"
        >
          <i class="fas fa-user-slash"></i>
          Remove grader assignment
        </button>
        <div class="dropdown-divider"></div>
        <button
          class="dropdown-item"
          type="submit"
          name="batch_action_data"
          value="${JSON.stringify({ requires_manual_grading: true })}"
        >
          <i class="fas fa-tag"></i>
          Tag as required grading
        </button>
        <button
          class="dropdown-item"
          type="submit"
          name="batch_action_data"
          value="${JSON.stringify({ requires_manual_grading: false })}"
        >
          <i class="fas fa-check-square"></i>
          Tag as graded
        </button>
      </div>
    </div>
  `.toString();
}

function updateGradingTagButton() {
  $('.grading-tag-button').prop(
    'disabled',
    !$('#grading-table').bootstrapTable('getSelections').length,
  );
}

function pointsFormatter(
  points: string,
  row: InstanceQuestionRow,
  _index: number,
  field: 'manual_points' | 'auto_points' | 'points',
) {
  const { hasCourseInstancePermissionEdit, urlPrefix, csrfToken } =
    document.getElementById('grading-table')?.dataset ?? {};
  const maxPoints = row.assessment_question[`max_${field}`];
  const buttonId = `editQuestionPoints_${field}_${row.id}`;

  return html`${formatPoints(Number(points))}
    <small>/<span class="text-muted">${maxPoints ?? 0}</span></small>
    ${hasCourseInstancePermissionEdit === 'true'
      ? EditQuestionPointsScoreButton({
          field,
          instance_question: row,
          assessment_question: row.assessment_question,
          urlPrefix: urlPrefix ?? '',
          csrfToken: csrfToken ?? '',
          buttonId,
        })
      : ''}`;
}

function scorebarFormatter(score: number | null, row: InstanceQuestionRow) {
  const { hasCourseInstancePermissionEdit, urlPrefix, csrfToken } =
    document.getElementById('grading-table')?.dataset ?? {};
  const buttonId = `editQuestionScorePerc${row.id}`;

  return html`<div class="d-inline-block align-middle">
      ${score == null
        ? ''
        : html`<div class="progress bg" style="min-width: 10em; max-width: 20em;">
            <div
              class="progress-bar bg-success"
              style="width: ${Math.floor(Math.min(100, score))}%"
            >
              ${score >= 50 ? `${Math.floor(score)}%` : ''}
            </div>
            <div
              class="progress-bar bg-danger"
              style="width: ${100 - Math.floor(Math.min(100, score))}%"
            >
              ${score >= 50 ? '' : `${Math.floor(score)}%`}
            </div>
          </div>`}
    </div>
    ${hasCourseInstancePermissionEdit === 'true'
      ? EditQuestionPointsScoreButton({
          field: 'score_perc',
          instance_question: row,
          assessment_question: row.assessment_question,
          urlPrefix: urlPrefix ?? '',
          csrfToken: csrfToken ?? '',
          buttonId,
        })
      : ''}`.toString();
}
