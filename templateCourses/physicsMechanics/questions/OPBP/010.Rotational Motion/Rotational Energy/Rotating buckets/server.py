import random as rd
import sympy as sp
import problem_bank_scripts.prairielearn as pl
import problem_bank_helpers as pbh

def imports(data):
    import random as rd
    import sympy as sp
    import problem_bank_scripts.prairielearn as pl
    import problem_bank_helpers as pbh
    
def generate(data):
    data2 = pbh.create_data2()
    
    # store phrases etc
    data2["params"]["vars"]["title"] = "Rotating Buckets"
    data2["params"]["vars"]["units"] = "kg"
    
    # define bounds of the variables
    # use m1 for mass because m needs to be used as a sympy symbol
    # c is the constant divisor in part 2
    m1 = pbh.roundp(rd.uniform(1.00, 3.00), sigfigs = 3)
    c = rd.randint (2,6)
    
    # store the variables in the dictionary "params"
    data2["params"]["m1"] = m1
    data2["params"]["c"] = c
    
    ## Part 1
    
    # Declare math symbols to be used by sympy
    m, l = sp.symbols('m l')
    
    # Describe the solution equation
    I = m*l*l/2
    
    # Answer to fill in the blank input stored as JSON.
    data2['correct_answers']['part1_ans'] = pl.to_json(I)
    
    ## Part 2
    
    # calculate final mass of one bucket
    m_f = c * m1
    
    # define correct answers
    data2["correct_answers"]["part2_ans"] = 2*(m_f -m1)
    
    # Update the data object with a new dict
    data.update(data2)
    
def prepare(data):
    pass
    
def parse(data):
    pass
    
def grade(data):
    pass
    