; 01_layered_donut.nc
; A multi-layer donut routine that machines concentric rings across several Z levels.
; Every key point is derived from R-parameters so you can tweak the center, radii,
; feeds, and depths directly inside the viewer.

; --- parameter table ---
R1=150            ; donut center X
R2=120            ; donut center Y
R3=42             ; outer radius
R4=22             ; inner radius
R5=6              ; lead-in length
R6=6              ; depth per layer
R7=-18            ; final depth
R8=55             ; retract plane
R9=4              ; safe clearance above stock
R10=900           ; helical feed
R11=1400          ; planar feed
R12=600           ; plunge feed

; --- derived helpers ---
R20=-R6           ; first depth
R21=R20-R6        ; second depth
R22=R7            ; finishing depth
R23=R3-6          ; mid radius for blend pass
R24=R4+3          ; inner wall rough radius

G17 G90 G94
G00 Z=R8
G00 X=R1+R3+R5 Y=R2
G00 Z=R9

; helical ramp to first layer on the outer wall
G01 Z=R20 F=R12
G03 X=R1+R3 Y=R2 I=-R5 J=0 Z=R21 F=R10
G03 X=R1+R3 Y=R2 I=-R5 J=0 Z=R22 F=R10

; finish the outer wall at the bottom
G03 X=R1+R3 Y=R2 I=-R3 J=0 F=R11

; blend pass between outer radius and mid radius
G01 X=R1+R23 Y=R2
G03 X=R1+R23 Y=R2 I=-R23 J=0

; transition arc down the Y positive side to show XY offsets
G03 X=R1 Y=R2+R23 I=-R23 J=0
G01 X=R1 Y=R2+R4

; rapid across the bore and rough the inner wall
G00 X=R1+R4 Y=R2
G01 Z=R21 F=R12
G02 X=R1+R4 Y=R2 I=-R4 J=0 F=R11

; finish pass hugging the adjustable rough radius
G01 X=R1+R24 Y=R2
G02 X=R1+R24 Y=R2 I=-R24 J=0

; final clean-up skim at full depth on the true inner radius
G01 Z=R22 F=R12
G02 X=R1+R4 Y=R2 I=-R4 J=0 F=R11

; exit upwards so the Z motion is visible in the viewer
G00 Z=R8
G00 X=R1-R3-R5 Y=R2
M30

