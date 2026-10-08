import json
STYLE = ("Cinematic premium commercial, shot on large-format digital cinema camera with vintage anamorphic-look primes, "
 "warm natural light, soft shadows, shallow depth of field, gentle film grain, restrained warm grade of ivory, walnut, cognac and charcoal, "
 "realistic full-grain leather with visible pores, saddle stitching and burnished edges, natural unposed expressions, "
 "calm modern European atmosphere, 24fps, 16:9.")
NEG = ("plastic or glossy faux leather, warped or melting straps, extra handles, extra zippers, inconsistent bag shape, "
 "distorted hands, extra fingers, floating objects, any visible text or letters, any logo, oversized branding, "
 "sports cars, champagne, jewellery close-ups, exaggerated smiles, posing to camera, crowded frame, whip pans, heavy lens flare")

products = {
 "P1A": {"name":"Laptop bag · cognac","desc":"a slim structured cognac full-grain leather laptop briefcase, about 40 by 29 by 8 cm, two rolled leather top handles, a detachable 3.5 cm leather shoulder strap with antique-brass swivel hooks, one full-length antique-brass zip with a round leather-wrapped pull, a flat front slip pocket, tonal saddle stitching, burnished dark edges","brand":"3 cm circular K mark debossed (blind, no foil) on lower-right of front panel; brass zip pull carries a tiny engraved K"},
 "P1B": {"name":"Laptop bag · black","desc":"the same slim structured briefcase design in matte black full-grain leather with antique-brass hardware, two rolled top handles, detachable shoulder strap","brand":"same debossed K position as P1A; small brushed-brass tag reading KAPTAN riveted beside the handle base"},
 "P2":  {"name":"Backpack · tan","desc":"a minimal rectangular tan full-grain leather backpack, about 44 by 30 by 14 cm, top zip opening with antique-brass zip, one vertical front zip pocket, padded leather shoulder straps with brass adjusters, a slim rolled top grab handle","brand":"debossed K mark centred under the front pocket zip; KAPTAN debossed on the inner pocket flap"},
 "P3A": {"name":"Weekender · cognac","desc":"a large cognac full-grain leather weekender holdall, about 55 by 28 by 28 cm, two rolled handles joined by a leather wrap, detachable wide shoulder strap, antique-brass hardware, four small brass feet, a softly structured body that slumps slightly when set down","brand":"cognac leather luggage tag on a looped strap, KAPTAN embossed on its face; K debossed on the side panel"},
 "P3B": {"name":"Small holdall · camel","desc":"a smaller camel full-grain leather holdall in the same design family as the weekender, about 40 by 22 by 22 cm, rolled handles, antique-brass hardware","brand":"debossed K on side panel"},
 "P4":  {"name":"Toiletry bag · dark brown","desc":"a dark brown full-grain leather toiletry bag, about 26 by 14 by 14 cm, U-shaped wide-opening antique-brass zip, sand-coloured coated lining, a leather carry loop at one end","brand":"debossed K on the end panel beside the carry loop; woven KAPTAN label stitched into the lining"},
 "P5A": {"name":"Wallet · black (him)","desc":"a slim black full-grain leather bifold wallet with eight card slots, clean painted edges, fine tonal stitching","brand":"KAPTAN blind-debossed inside the left panel, about 2 cm wide"},
 "P5B": {"name":"Wallet · deep burgundy (her)","desc":"a compact deep burgundy leather wallet with a snap closure and card slots, glossy painted edges","brand":"small gold-foil KAPTAN inside the flap"},
 "P6A": {"name":"Belt · black formal","desc":"a 3.5 cm black full-grain leather dress belt with fine edge stitching and a slim polished palladium-tone frame buckle","brand":"KAPTAN debossed on the belt reverse near the buckle; matte black box with gold-foil KAPTAN"},
 "P6B": {"name":"Belt · cognac","desc":"a 3.5 cm cognac full-grain leather belt with edge stitching and a brushed antique-brass buckle","brand":"KAPTAN debossed on reverse near the buckle"},
 "P7":  {"name":"Jacket · dark chocolate","desc":"a minimal dark chocolate brown lambskin leather jacket with a soft shirt collar, centre zip in antique brass, two slanted welt pockets, clean cuffs with a short zip, no belts, no studs, no epaulettes, relaxed tailored fit","brand":"woven KAPTAN label in ivory on charcoal stitched inside the neckline; K engraved on zip puller"},
}
cast = {
 "C1":"Daniel — man, about 32, Mediterranean, short dark hair, trimmed beard; navy unstructured blazer, white oxford shirt, grey wool trousers, brown suede loafers",
 "C2":"Amara — woman, about 35, Black, natural hair in a low bun, small gold studs; camel wool coat over an ivory knit, charcoal wide-leg trousers",
 "C3":"Colleague — man, about 40, East Asian, short neat hair, light grey merino sweater over a white tee",
 "C4":"Lena — woman, about 26, Northern European, shoulder-length light brown hair; olive overshirt, white tee, straight dark jeans, white leather sneakers",
 "C5":"Sofia — woman, about 30, Latina, dark wavy hair tied back; cream cable-knit, tan trench, ecru trousers",
 "C6":"Karim — man, about 33, South Asian, short black hair, light stubble; charcoal knit polo, stone chinos, navy overcoat",
 "C7":"Marco — man, about 42, salt-and-pepper hair, clean shaven; charcoal two-piece suit, white shirt (formal); navy knit, beige trousers (business casual)",
 "C8":"Elif — woman, about 29, Turkish, dark shoulder-length wavy hair; cream fine-gauge turtleneck, black tailored trousers, the P7 jacket",
}
S = [
 # id, start, end, scene, shot, camera, prompt, products, cast, logo
 (1,0.0,2.5,"1 · Morning","Macro hook","Slow lateral dolly, 100mm macro",
  "Extreme macro of cognac full-grain leather in early morning window light; a slow lateral glide across visible pores and a row of tonal saddle stitching toward a burnished edge, raking warm light reveals texture, dust motes in soft focus",["P1A"],[],"Track the debossed K into the last 0.8 s as focus lands on it. Better practical: shoot this macro on the real bag."),
 (2,2.5,5.0,"1 · Morning","Pick-up","Static wide → slow push in, 35mm",
  "A bright modern apartment with oak herringbone floor and linen curtains; Daniel finishes buttoning his blazer and lifts {P1A} from a light oak chair by its two top handles, the bag keeps its rigid shape, morning sun across the room",["P1A"],["C1"],"Deboss visible small on front panel; composite in post."),
 (3,5.0,7.0,"1 · Morning","Packing insert","Top-down, locked off, 50mm, 48fps slowed",
  "Close top-down shot of hands sliding a thin silver laptop into the padded sleeve of an open {P1A}, then a black notebook and a coiled white charger, fingers then draw the antique-brass zip closed in one smooth pull, realistic hands and knuckles",["P1A"],["C1"],"Brass zip pull with engraved K reads for 10 frames at end of zip pull."),
 (4,7.0,9.0,"1 · Morning","City walk","Backward tracking, gimbal, 40mm",
  "Daniel walks out onto a sunny tree-lined European boulevard with pale limestone facades, {P1A} carried on its shoulder strap resting naturally at his hip, strap lies flat on the blazer shoulder, relaxed confident stride, soft background pedestrians",["P1A"],["C1"],"None needed; brand already established."),
 (5,9.0,10.8,"2 · Urban elegance","Café arrival","Slow dolly right, 35mm",
  "A bright minimalist café co-working space with walnut tables and plants; Amara sets {P1B} upright on the floor beside her chair and draws out a laptop, she glances up and smiles naturally at a colleague arriving",["P1B"],["C2","C3"],"Brass KAPTAN tag beside handle base; composite."),
 (6,10.8,12.0,"2 · Urban elegance","Detail insert","Macro rack focus, 90mm",
  "Macro of a rolled black leather handle meeting the bag body, tonal stitching and an antique-brass ring, focus racks from handle to a small rectangular brushed-brass tag riveted beside it, warm café light",["P1B"],[],"Engrave KAPTAN on the tag in post (plain tag in generation)."),
 (7,12.0,14.5,"3 · Everyday city","Station walk","Side tracking, 50mm",
  "Lena walks through a sunlit modern train station concourse with high glass roof, wearing {P2} on both shoulders, straps sit naturally, backpack moves slightly with each step, she smiles at something off-screen",["P2"],["C4"],"Deboss under front pocket; composite."),
 (8,14.5,16.5,"3 · Everyday city","Unpacking","Medium close, slight push, 50mm",
  "Seated on a wooden bench, Lena unzips the top of {P2} on her lap and lifts out a tablet, a notebook, over-ear headphones and a steel water bottle, unhurried and natural",["P2"],["C4"],"KAPTAN on inner flap visible briefly."),
 (9,16.5,18.0,"3 · Everyday city","Back on","Low angle, slow motion",
  "Lena swings {P2} onto one shoulder and steps out into a bright creative district street, easy smile, warm afternoon light",["P2"],["C4"],"—"),
 (10,18.0,20.5,"4 · Weekend journey","Packing","Overhead to 3/4, slow crane down",
  "Bright bedroom with white linen bed; Sofia folds a cream knit into an open {P3A} while Karim tucks a pair of brown suede loafers into the end, then pulls the antique-brass zip closed along the top",["P3A"],["C5","C6"],"—"),
 (11,20.5,23.0,"4 · Weekend journey","Station stride","Wide tracking, 48fps slowed",
  "Sofia and Karim walk together through a grand railway station hall with arched iron and glass roof, Karim carries {P3A} by its handles with ease, Sofia carries {P3B}, a leather luggage tag swings gently, sweeping cinematic movement",["P3A","P3B"],["C5","C6"],"Tag face blank in generation; KAPTAN emboss tracked in post."),
 (12,23.0,24.5,"4 · Weekend journey","Luggage tag","Macro, 100mm",
  "Macro of a cognac leather luggage tag with a looped leather strap and brass buckle swaying slowly against the side of a cognac leather holdall, sunbeams in the station haze",["P3A"],[],"Hero branding moment: embossed KAPTAN on tag face. Strongly recommend a practical shot with the real tag."),
 (13,24.5,27.0,"5 · Hotel","Toiletry bag","Slow push in, 50mm",
  "A calm premium hotel bathroom with white Carrara marble counter and brass fixtures; Karim opens {P4} wide, revealing a glass fragrance bottle, a bamboo toothbrush, a safety razor and small skincare jars neatly arranged, he lifts out the fragrance",["P4"],["C6"],"K on end panel + woven lining label (composite or practical)."),
 (14,27.0,29.0,"6 · Everyday","Wallet · him","Close, 85mm",
  "In a softly lit restaurant, Daniel draws {P5A} from his inside blazer pocket, opens it in one hand and slides out a single plain dark card, focus on the leather and the motion, no cash visible",["P5A"],["C1"],"Blind KAPTAN inside left panel; composite."),
 (15,29.0,30.5,"6 · Everyday","Wallet · her","Medium close, 65mm",
  "In a bright boutique with oak shelves, Amara opens {P5B} at the counter and takes out a card, relaxed natural expression",["P5B"],["C2"],"Gold-foil KAPTAN inside flap; composite."),
 (16,30.5,32.5,"7 · Formal","Black belt","Macro, 100mm",
  "Close on Marco's hands threading {P6A} through the loops of charcoal suit trousers and fastening the polished buckle, crisp white shirt tucked, clean dressing-room light",["P6A"],["C7"],"Black gift box with gold-foil KAPTAN on the dresser in background."),
 (17,32.5,34.0,"7 · Formal","Cognac belt · full look","Mirror reflection, 35mm",
  "In a warm hallway mirror, Marco in a navy knit and beige trousers finishes fastening {P6B}, checks the full look and picks up his keys",["P6B"],["C7"],"—"),
 (18,34.0,36.5,"8 · Jacket","Putting it on","Medium, slow orbit, 40mm",
  "Golden hour on a quiet European side street; Elif shrugs on {P7}, settles the shoulders and turns up the soft collar with both hands",["P7"],["C8"],"—"),
 (19,36.5,39.0,"8 · Jacket","Evening walk","Front tracking, 50mm",
  "Elif walks comfortably along an elegant street at dusk with warm shop windows, wearing {P7} open over a cream turtleneck, the leather softly catches the light",["P7"],["C8"],"—"),
 (20,39.0,41.0,"8 · Jacket","Café terrace","Medium wide, slow dolly",
  "On a café terrace at blue hour, Elif sits with two friends, wearing {P7}, laughing naturally at a story, wine glasses and small plates on the table",["P7"],["C8"],"—"),
 (21,41.0,43.0,"8 · Jacket","Label macro","Macro, 100mm",
  "Macro inside the neckline of a dark chocolate leather jacket: lining, a small woven label stitched at the collar, the antique-brass zip and a cuff seam, warm low light",["P7"],[],"Woven ivory-on-charcoal KAPTAN label. Practical insert recommended."),
 (22,43.0,47.5,"9 · Family","Product table","Very slow lateral dolly, 65mm",
  "On a long dark walnut table against a warm neutral plaster wall with soft single-source light, a curated still life: {P1A}, {P2}, {P3A}, {P4}, {P5A}, a coiled {P6B} and folded {P7}, generous spacing, slow camera glide across textures",["P1A","P2","P3A","P4","P5A","P6B","P7"],[],"Every product carries its mark in correct position; best done as a real tabletop shoot."),
 (23,47.5,49.5,"9 · Family","Top-down","Overhead slow push",
  "Overhead flat lay on honed black stone with soft light: {P5B}, {P6A} with its buckle, {P4} and the cognac luggage tag, arranged with breathing room",["P5B","P6A","P4","P3A"],[],"Tag + wallet foil readable."),
 (24,49.5,50.8,"10 · Human connection","Arrival","Wide, slow push",
  "Sofia and Karim arrive into a calm elegant hotel lobby with warm stone floors, {P3A} in hand, they share a relaxed look and smile",["P3A","P3B"],["C5","C6"],"—"),
 (25,50.8,52.0,"10 · Human connection","Last stride","Tracking, slow motion",
  "Daniel crosses a sunlit square with {P1A} on his shoulder and glances back with a small easy smile",["P1A"],["C1"],"Hold, then dip to end card."),
]
shots=[]
for (i,a,b,scene,label,cam,p,prods,cs,logo) in S:
    full=p
    for k in products: full=full.replace("{%s}"%k, products[k]["desc"])
    shots.append({"id":i,"in":a,"out":b,"scene":scene,"label":label,"camera":cam,
      "prompt":f"{full}. Camera: {cam}. {STYLE}","negative":NEG,"products":prods,"cast":cs,"branding":logo})
shots.append({"id":26,"in":52.0,"out":60.0,"scene":"Final","label":"End card","camera":"Rendered (endcard.html)","prompt":None,"negative":None,"products":[],"cast":[],"branding":"KAPTAN wordmark → tagline → second line → logo emblem. Already rendered: renders/kaptan-endcard-1080p.webm"})
json.dump({"title":"KAPTAN — Crafted for the Journey","duration":60,"fps":24,"aspect":"16:9","style_suffix":STYLE,"negative":NEG,"products":products,"cast":cast,"shots":shots},open("shots.json","w"),indent=1,ensure_ascii=False)
print(len(shots),"shots")
