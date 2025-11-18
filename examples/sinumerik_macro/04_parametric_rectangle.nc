%; Parametric rectangle finish using only R assignments
; This example exaggerates the lead-in and finish stock so you can tweak values
; and immediately see the rectangle grow/shrink in the viewer.

R1=120 ; width of the boss
R2=60  ; height of the boss
R3=8   ; finish stock to leave on each side
R4=5   ; finish depth
R5=R1/2+R3 ; X half-span including stock
R6=R2/2+R3 ; Y half-span including stock

G17 G90 G94
T1 M6
G0 Z100
G0 X=-R5 Y=-R6
G1 Z=-R4 F300
G1 X=R5   F600
G1 Y=R6
G1 X=-R5
G1 Y=-R6

; tighten to the final dimension by reducing the stock parameters
R5=R1/2
R6=R2/2
G0 Z10
G1 Z=-R4 F300
G1 X=R5   F450
G1 Y=R6
G1 X=-R5
G1 Y=-R6
G0 Z50
M30

