; 02_plate_star_cutout.nc
; Macro-driven rectangular plate contour with a five-point star cut-out and pilot hole.
; The routine keeps everything on the XY plane easy to read while exercising R-expressions
; for both the outside profile and the internal geometry.

; --- plate parameters ---
R1=220            ; plate center X
R2=80             ; plate center Y
R3=180            ; plate width
R4=120            ; plate height
R5=12             ; thickness to remove
R6=8              ; corner radius
R7=4              ; lead-in distance
R8=40             ; clearance plane
R9=6              ; safe height above part
R10=1000          ; contour feed
R11=500           ; plunge feed

; --- star parameters ---
R20=36            ; outer star radius
R21=15            ; inner star radius
R22=-R5           ; star final depth

; --- helpers ---
R30=R3*0.5        ; half width
R31=R4*0.5        ; half height
R32=-R5*0.5       ; mid depth for outside wall
R33=-R5           ; final depth for outside wall

; trig-like multipliers for the star points (pre-multiplied constants)
R40=0.0
R41=0.30901699
R42=0.58778525
R43=0.80901699
R44=0.95105651

G17 G90 G94
G00 Z=R8

; --- outer rectangle with rounded corners ---
G00 X=R1-R30-R7 Y=R2-R31
G00 Z=R9
G01 Z=R32 F=R11
G01 X=R1+R30+R7 F=R10
G03 X=R1+R30 Y=R2-R31+R6 I=0 J=R6
G01 Y=R2+R31-R6
G03 X=R1+R30-R6 Y=R2+R31 I=-R6 J=0
G01 X=R1-R30+R6
G03 X=R1-R30 Y=R2+R31-R6 I=0 J=-R6
G01 Y=R2-R31+R6
G03 X=R1-R30+R6 Y=R2-R31 I=R6 J=0
G01 X=R1-R30-R7
G01 Z=R33 F=R11
G01 X=R1+R30+R7 F=R10
G03 X=R1+R30 Y=R2-R31+R6 I=0 J=R6
G01 Y=R2+R31-R6
G03 X=R1+R30-R6 Y=R2+R31 I=-R6 J=0
G01 X=R1-R30+R6
G03 X=R1-R30 Y=R2+R31-R6 I=0 J=-R6
G01 Y=R2-R31+R6
G03 X=R1-R30+R6 Y=R2-R31 I=R6 J=0
G01 X=R1-R30-R7

; --- pilot hole in the middle ---
G00 X=R1 Y=R2
G01 Z=R33 F=R11
G03 X=R1 Y=R2 I=-10 J=0 F=R10
G00 Z=R9

; --- star-shaped cut-out ---
G00 X=R1 Y=R2+R20
G01 Z=R22 F=R11
G01 X=R1+R20*R41 Y=R2+R20*R44 F=R10
G01 X=R1+R21*R43 Y=R2+R21*R41
G01 X=R1+R20*R44 Y=R2-R20*R41
G01 X=R1+R21*R41 Y=R2-R21*R43
G01 X=R1 Y=R2-R20
G01 X=R1-R21*R41 Y=R2-R21*R43
G01 X=R1-R20*R44 Y=R2-R20*R41
G01 X=R1-R21*R43 Y=R2+R21*R41
G01 X=R1-R20*R41 Y=R2+R20*R44
G01 X=R1 Y=R2+R20

; show a final skim around the inside to highlight the XY axes
G03 X=R1 Y=R2+R20 I=0 J=-R20

G00 Z=R8
G00 X=0 Y=0
M30
Should I check or u
