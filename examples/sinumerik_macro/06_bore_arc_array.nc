%; Sinumerik macro test - twin bores with arc finishing
(Shows how literal NC lines with circular moves stay editable through R parameters)

R100=36.5     ; X column location for both bores
R101=859.358  ; Y center of the first bore
R102=972.122  ; Y center of the second bore
R103=38.0     ; safe retract plane
R104=4.5      ; cutting depth
R105=1.5      ; bore radius used for the arc blocks
R110=1200     ; linear feed
R111=8000     ; circular feed

G17 G90 G94
G0 Z=R103

; First bore
G0 X=R100 Y=R101 F=R110
G1 Z=R104 F=R110
G1 Y=R101+R105 F=R110
G17 G3 X=R100 Y=R101-R105 R=R105 F=R111
G17 G3 X=R100 Y=R101+R105 R=R105 F=R111
G0 Z=R103 F=R110

; Second bore
G0 X=R100 Y=R102 F=R110
G1 Z=R104 F=R110
G1 Y=R102+R105 F=R110
G17 G3 X=R100 Y=R102-R105 R=R105 F=R111
G17 G3 X=R100 Y=R102+R105 R=R105 F=R111
G0 Z=R103 F=R110

M30
