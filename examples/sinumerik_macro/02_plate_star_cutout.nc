; 02_plate_star_cutout.nc
; Flat 2D contour of a rounded rectangle plus a nested regular hexagon window.
; Dimensions mirror Hurco/Sinumerik training plates but everything is machined in
; a single engraving plane so the preview matches DXF/SVG art directly.

; --- plate parameters ---
R1=0              ; origin X
R2=0              ; origin Y
R3=220            ; width
R4=150            ; height
R5=-3             ; engraving depth (single pass)
R6=12             ; corner radius
R7=8              ; tangential lead length
R8=45             ; retract plane
R9=6              ; safe plane
R10=700           ; plunge feed
R11=1500          ; contour feed

; --- inner hex parameters ---
R20=70            ; circumscribed radius
R21=R20*0.8660254 ; X offset for vertices (cos 30°)
R22=R20*0.5       ; Y offset for vertices (sin 30°)

; --- derived helpers ---
R30=R3*0.5
R31=R4*0.5

G17 G90 G94
G00 Z=R8

; --- outer rounded rectangle ---
G00 X=R1+R30+R7 Y=R2+R31-R6
G00 Z=R9
G01 Z=R5 F=R10
G01 X=R1+R30 Y=R2+R31-R6 F=R11
G03 X=R1+R30-R6 Y=R2+R31 I=-R6 J=0
G01 X=R1-R30+R6 Y=R2+R31
G03 X=R1-R30 Y=R2+R31-R6 I=0 J=-R6
G01 Y=R2-R31+R6
G03 X=R1-R30+R6 Y=R2-R31 I=R6 J=0
G01 X=R1+R30-R6 Y=R2-R31
G03 X=R1+R30 Y=R2-R31+R6 I=0 J=R6
G01 Y=R2+R31-R6
G01 X=R1+R30+R7
G00 Z=R8

; --- center pilot circle (decorative) ---
G00 X=R1 Y=R2
G00 Z=R9
G01 Z=R5 F=R10
G03 X=R1 Y=R2 I=-12 J=0 F=R11
G00 Z=R8

; --- regular hexagon window ---
G00 X=R1 Y=R2+R20
G00 Z=R9
G01 Z=R5 F=R10
G01 X=R1+R21 Y=R2+R22 F=R11
G01 X=R1+R21 Y=R2-R22
G01 X=R1 Y=R2-R20
G01 X=R1-R21 Y=R2-R22
G01 X=R1-R21 Y=R2+R22
G01 X=R1 Y=R2+R20
G00 Z=R8

G00 X=0 Y=0
M30
