%; SINUMERIK MACRO TEST - BASIC SQUARE POCKET
(Parametric square profiling using R-parameters)
R1=10.0 ; half width
R2=5.0  ; half height
R3=500  ; feedrate
R10=R1*2
R11=R2*2
G90 G17 G94
G0 X0 Y0 Z50
G1 Z5 F200
G1 Z0 F300
G1 X=R1 Y=-R2 F=R3
G1 X=R1 Y=R2
G1 X=-R1 Y=R2
G1 X=-R1 Y=-R2
G1 X=R1 Y=-R2
G0 Z50
M30
