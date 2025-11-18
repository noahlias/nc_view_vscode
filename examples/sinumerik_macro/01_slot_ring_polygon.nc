; 01_slot_ring_polygon.nc
; 2D-only bolt-circle slot array inspired by Siemens SLOT1 nests. Each slot is
; cut once at a single engraving depth so the rendered path matches DXF/SVG data.

; --- parameters ---
R1=0              ; pattern center X
R2=0              ; pattern center Y
R3=72             ; radius to slot centers
R4=34             ; slot length
R5=18             ; slot width
R6=-3             ; engraving depth
R7=6              ; safe plane
R8=50             ; retract plane
R9=600            ; plunge feed
R10=1400          ; contour feed

; --- derived helpers ---
R20=R3+R4*0.5     ; outer tip radius
R21=R3-R4*0.5     ; inner tip radius
R22=R5*0.5        ; arc radius for slot ends
R23=R22*1.1       ; tangential entry arc

G17 G90 G94
G00 Z=R8

; helper macro for horizontal slots (east/west)
LBL 10
  G00 X=R60 Y=R61+R22+R23
  G00 Z=R7
  G01 Z=R6 F=R9
  G03 X=R60 Y=R61+R22 R=R23 F=R10
  G03 X=R60 Y=R61-R22 R=R22
  G01 X=R62 Y=R61-R22
  G03 X=R62 Y=R61+R22 R=R22
  G01 X=R60 Y=R61+R22
  G03 X=R60 Y=R61+R22+R23 R=R23
  G00 Z=R8
LBL 0

; helper macro for vertical slots (north/south)
LBL 20
  G00 X=R60+R22+R23 Y=R61
  G00 Z=R7
  G01 Z=R6 F=R9
  G03 X=R60+R22 Y=R61 R=R23 F=R10
  G03 X=R60-R22 Y=R61 R=R22
  G01 Y=R62
  G03 X=R60+R22 Y=R62 R=R22
  G01 Y=R61
  G03 X=R60+R22+R23 Y=R61 R=R23
  G00 Z=R8
LBL 0

; east slot
R60=R1+R20
R61=R2
R62=R1+R21
CALL LBL 10

; west slot
R60=R1-R20
R61=R2
R62=R1-R21
CALL LBL 10

; north slot
R60=R1
R61=R2+R20
R62=R2+R21
CALL LBL 20

; south slot
R61=R2-R20
R62=R2-R21
CALL LBL 20

G00 X=0 Y=0
M30
