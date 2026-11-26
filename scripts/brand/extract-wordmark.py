import json, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

f = TTFont(sys.argv[1])
f = instantiateVariableFont(f, {"wght": 700})
upm = f["head"].unitsPerEm
cmap = f.getBestCmap()
gs = f.getGlyphSet()
hmtx = f["hmtx"]
track = -0.035 * upm  # letter-spacing from .wordmark

def run(text, x0):
    pen = SVGPathPen(gs)
    bp = BoundsPen(gs)
    x = x0
    for ch in text:
        g = cmap[ord(ch)]
        t = (1, 0, 0, -1, x, 0)  # flip y: baseline at 0
        gs[g].draw(TransformPen(pen, t))
        gs[g].draw(TransformPen(bp, t))
        x += hmtx[g][0] + track
    return pen.getCommands(), bp.bounds, x

word, wb, x = run("one up", 0)
dot, db, x2 = run(".", x)
one, ob, _ = run("one", 0)
up, ub, xu = run("up", 0)
dot2, d2b, _ = run(".", xu)
print(json.dumps({"upm": upm, "word": word, "dot": dot, "wordBounds": wb, "dotBounds": db,
  "one": one, "oneBounds": ob, "up": up, "upBounds": ub, "upDot": dot2, "upDotBounds": d2b}))
