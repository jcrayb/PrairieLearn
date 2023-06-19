import random
import pandas as pd
import problem_bank_helpers as pbh
import math

def imports(data):
    import random
    import pandas as pd
    import problem_bank_helpers as pbh
    import math
    
def generate(data):
    data2 = pbh.create_data2()
    
    # store phrases etc
    data2["params"]["vars"]["title"] = "Block on a Wall"
    data2["params"]["vars"]["units"] = "N"
    
    # define bounds of the variables
    theta = random.randint(20,70)
    m = random.randint(1,10)
    mu = random.randint(200,500)/1000
    g = 9.81
    
    # store the variables in the dictionary "params"
    data2["params"]["theta"] = theta
    data2["params"]["m"] = m
    data2["params"]["mu"] = mu
    
    # define correct answers
    data2["correct_answers"]["part1_ans"] = ((m*g)/(math.sin(math.radians(theta))+mu*math.cos(math.radians(theta))))
    
    # Update the data object with a new dict
    data.update(data2)
    
def prepare(data):
    pass
    
def parse(data):
    pass
    
def grade(data):
    pass
    