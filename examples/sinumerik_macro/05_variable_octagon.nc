%; Variable octagon profile showing macro-controlled chamfers
; Modify R1 to stretch the octagon and watch all approach moves update.

R1=70           ; across-flats size
R2=R1/2         ; apothem
R3=R2*0.4142    ; chamfer offset based on tan(22.5)
R4=R2+12        ; rapid clearance radius
R5=2            ; finish depth

G17 G90 G94
T1 M6
G0 Z80
G0 X0 Y=R4
G1 Z=-R5 F250

; walk around the octagon using computed vertices
G1 X=R3   Y=R2   F500
G1 X=R2   Y=R3
G1 X=R2   Y=-R3
G1 X=R3   Y=-R2
G1 X=-R3  Y=-R2
G1 X=-R2  Y=-R3
G1 X=-R2  Y=R3
G1 X=-R3  Y=R2
G1 X=0    Y=R2

G0 Z60
M30

