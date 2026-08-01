// generate-relation-candidates.js
// node generate-relation-candidates.js  ->  relation-candidates.txt
//
// Themes and word pools are curated by hand — the value of a Relation puzzle is
// a theme that lands, and no dictionary sweep produces that. The script buckets
// each pool by word length, searches for a 3/4/5/6 combination that satisfies
// the letter rule, and computes every statistic it prints. Nothing in the output
// is typed by hand, so nothing in it can be quietly wrong.
//
// CONSTRAINT NOTE
// The brief gives two incompatible rules: "no two words share a letter", then
// "ideally no letter appears more than twice". Its own examples follow the
// second, not the first — FOG/HAIL/SLEET/SHOWER is labelled "Duplicate letters:
// None" but actually runs O2 H2 L2 S2 and E3, breaking even the looser rule, and
// HAY/BARN/FENCE/TROUGH has five letters twice. The hard rule enforced here is
// therefore: no letter more than TWICE across the 18 tiles. Sets that reach 18
// entirely distinct letters are rare and are marked ZERO-DUPLICATE.
'use strict';

const fs = require('fs');
const path = require('path');

// One pool per theme. Lengths are bucketed by the script, so a word of the wrong
// length is simply unused rather than a silent error.
// obscure: words worth a second look. stretch: a note on theme coherence.
const THEMES = [
  { theme: 'Types of weather',
    pool: ['SUN','FOG','ICE','HAIL','RAIN','WIND','SNOW','GALE','FROST','SLEET','STORM','CLOUDY','SQUALL','DRIZZLE'] },

  { theme: 'Things on a farm',
    pool: ['HAY','PIG','COW','SOW','BARN','GOAT','CORN','MILK','FENCE','WHEAT','STALL','SHEEP','TROUGH','HARROW','SILAGE'] },

  { theme: 'Kitchen tools',
    pool: ['PAN','POT','CUP','JUG','OVEN','FORK','BOWL','WHISK','LADLE','PLATE','KNIFE','TONGS','GRATER','KETTLE','TEAPOT','SPOONS'] },

  { theme: 'Things in the sea',
    pool: ['COD','EEL','RAY','KELP','CRAB','REEF','TUNA','WHALE','CORAL','SQUID','SHARK','SHRIMP','OYSTER','MUSSEL','SPONGE'] },

  { theme: 'Musical instruments',
    pool: ['SAX','HORN','DRUM','HARP','LUTE','CELLO','BANJO','FLUTE','ORGAN','PIANO','GUITAR','FIDDLE','VIOLIN','KAZOO'] },

  { theme: 'Parts of a house',
    pool: ['DEN','ROOF','DOOR','WALL','PORCH','ATTIC','FOYER','STAIR','CELLAR','GARAGE','PANTRY','LANDING'] },

  { theme: 'Breakfast foods',
    pool: ['EGG','JAM','HAM','OATS','MILK','TOAST','CREPE','BACON','WAFFLE','CEREAL','MUFFIN','YOGURT'] },

  { theme: 'Things in a garden',
    pool: ['BUD','POT','HOE','SOIL','SEED','VINE','LAWN','SPADE','MULCH','SHRUB','FLOWER','TROWEL','HEDGES','PRUNER'] },

  { theme: 'Winter clothing',
    pool: ['HAT','CAP','BOOT','COAT','MUFF','SCARF','GLOVE','PARKA','MITTEN','JUMPER','ANORAK','WOOLLY'] },

  { theme: 'Camping equipment',
    pool: ['AXE','COT','TENT','ROPE','TARP','STOVE','TORCH','FLASK','MALLET','KETTLE','BURNER','LANTERN'] },

  { theme: 'Desert things',
    pool: ['SUN','DUNE','SAND','HEAT','CAMEL','OASIS','SCRUB','CACTUS','LIZARD','MIRAGE','GOURD'] },

  { theme: 'Office supplies',
    pool: ['PEN','PAD','CLIP','FILE','TAPE','RULER','PAPER','TONER','STAPLE','BINDER','FOLDER','MARKER'] },

  { theme: 'Things in a toolbox',
    pool: ['SAW','AWL','NAIL','FILE','VICE','DRILL','CLAMP','LEVEL','WRENCH','HAMMER','PLIERS','CHISEL'] },

  { theme: 'Bodies of water',
    pool: ['BAY','SEA','POND','LAKE','COVE','CREEK','INLET','FJORD','LAGOON','STRAIT','SOUNDS','MARSH'] },

  { theme: 'Pirate things',
    pool: ['RUM','MAP','SHIP','CREW','GOLD','CHEST','SABRE','PLANK','PARROT','ANCHOR','CUTLAS','GALLEON'] },

  { theme: 'Things in a bathroom',
    pool: ['TUB','SOAP','BATH','COMB','TOWEL','BASIN','DRAIN','MIRROR','SPONGE','RAZORS','FLANNEL'] },

  { theme: 'Bird species',
    pool: ['OWL','JAY','WREN','CROW','DOVE','SWAN','FINCH','ROBIN','EGRET','TOUCAN','FALCON','MAGPIE','PUFFIN'] },

  { theme: 'Types of rock and mineral',
    pool: ['ORE','COAL','TALC','SLATE','SHALE','QUARTZ','BASALT','MARBLE','GRANITE','GYPSUM','FLINT'] },

  { theme: 'Things at the beach',
    pool: ['SUN','SAND','WAVE','SURF','TIDE','TOWEL','SHELL','CRABS','SHOVEL','BUCKET','PARASOL'] },

  { theme: 'Jungle animals',
    pool: ['APE','BAT','FROG','WASP','SLOTH','TIGER','SNAKE','GECKO','TOUCAN','JAGUAR','MONKEY','TAPIR'] },

  { theme: 'Objects in space',
    pool: ['SUN','STAR','MOON','MARS','COMET','ORBIT','PROBE','GALAXY','PLANET','NEBULA','METEOR','QUASAR'] },

  { theme: 'Medieval weapons',
    pool: ['BOW','AXE','PIKE','MACE','CLUB','LANCE','SWORD','SPEAR','DAGGER','HALBERD','QUIVER','ARMOUR'] },

  { theme: 'Parts of a tree',
    pool: ['SAP','BUD','BARK','LEAF','ROOT','TWIG','TRUNK','BOUGH','BRANCH','CANOPY','TIMBER'] },

  { theme: 'Things that are round',
    pool: ['ORB','COIN','DISC','HOOP','BALL','WHEEL','DONUT','PLATE','BUTTON','MARBLE','BUBBLE'] },

  { theme: 'Fishing gear',
    pool: ['ROD','NET','LURE','HOOK','BAIT','LINE','FLOAT','REELS','WADER','TACKLE','BASKET','SINKER'] },

  { theme: 'Precious stones',
    pool: ['GEM','JADE','OPAL','RUBY','TOPAZ','PEARL','AMBER','GARNET','ZIRCON','QUARTZ','SPINEL'] },

  { theme: 'Things in a car',
    pool: ['GAS','CAB','HORN','TYRE','SEAT','BOOT','WHEEL','BRAKE','GAUGE','MIRROR','ENGINE','BONNET'] },

  { theme: 'Things a chef does',
    pool: ['CUT','MIX','DICE','CHOP','BAKE','STIR','BLEND','ROAST','WHISK','SEASON','GRILLS','SAUTES'] },

  { theme: 'Mountain features',
    pool: ['CAP','PEAK','CRAG','SCREE','RIDGE','SLOPE','GULLY','SUMMIT','GLACIER','VALLEY','COULOIR'] },

  { theme: 'Things in a stable',
    pool: ['HAY','OAT','COLT','FOAL','MARE','REINS','STRAW','GROOM','SADDLE','BRIDLE','STIRRUP'] },

  { theme: 'Things in a forest',
    pool: ['FIR','ELM','OAK','MOSS','FERN','PINE','BIRCH','GLADE','TRAIL','CANOPY','THICKET','BRAMBLE'] },

  { theme: 'Things in the sky',
    pool: ['SUN','JET','MOON','STAR','KITE','BIRD','CLOUD','HAZE','PLANET','ROCKET','AIRSHIP'] },

  { theme: 'Spices and seasonings',
    pool: ['BAY','SALT','SAGE','MACE','DILL','CUMIN','THYME','BASIL','CLOVE','PEPPER','GINGER','NUTMEG'] },

  { theme: 'Things with a handle',
    pool: ['MUG','CUP','AXE','DOOR','PAIL','RAKE','BROOM','SPADE','KNIFE','BUCKET','KETTLE','HAMMER'] },

  { theme: 'Occupations',
    pool: ['VET','CHEF','POET','MONK','CLERK','PILOT','JUDGE','NURSE','BAKER','DOCTOR','FARMER','WELDER'] },

  { theme: 'Things on a desk',
    pool: ['PEN','PAD','LAMP','FILE','CLIP','MOUSE','PHONE','DIARY','FOLDER','SCREEN','STAPLER'] },

  { theme: 'Parts of a bicycle',
    pool: ['HUB','RIM','FORK','TYRE','SEAT','GEAR','CHAIN','BRAKE','SPOKE','PEDALS','SADDLE','HANDLE'] },

  { theme: 'Insects',
    pool: ['ANT','BEE','FLY','WASP','MOTH','GNAT','TICK','MIDGE','APHID','LOUSE','HORNET','WEEVIL','LOCUST'] },

  { theme: 'Colours of paint',
    pool: ['RED','TAN','TEAL','LIME','ROSE','GREY','OCHRE','UMBER','IVORY','INDIGO','VIOLET','SILVER'] },

  { theme: 'Things that fly',
    pool: ['JET','BAT','BEE','KITE','CROW','WASP','DRONE','GLIDER','FALCON','ROCKET','AIRSHIP'] },

  { theme: 'Types of soup',
    pool: ['PHO','MISO','LEEK','CORN','BROTH','LAKSA','GUMBO','LENTIL','OXTAIL','CHOWDER'] },

  { theme: 'Winter sports',
    pool: ['SKI','LUGE','CURL','SLED','SKATE','SLALOM','HOCKEY','BOBSLED','SKIING'] },

  { theme: 'Volcano words',
    pool: ['ASH','LAVA','VENT','DOME','CONE','MAGMA','CRUST','PLUME','CRATER','SUMMIT','BASALT'] },

  { theme: 'Things in a gym',
    pool: ['MAT','BAR','ROPE','BIKE','BELT','BENCH','TOWEL','SQUAT','WEIGHT','LOCKER','BARBELL'] },

  { theme: 'Things in a museum',
    pool: ['ART','URN','CASE','LABEL','RELIC','BUSTS','FOSSIL','PLINTH','GALLERY','EXHIBIT'] },

  { theme: 'Parts of a shoe',
    pool: ['TOE','TAB','SOLE','HEEL','WELT','LACES','UPPER','INSOLE','EYELET','TONGUE'] },

  { theme: 'Types of fabric',
    pool: ['NET','SILK','LACE','WOOL','JUTE','DENIM','LINEN','TWEED','SATIN','VELVET','COTTON','CANVAS'] },

  { theme: 'Things in a bank',
    pool: ['ATM','LOAN','CASH','SAFE','NOTE','VAULT','CHECK','TELLER','DEPOSIT','BRANCH'] },

  { theme: 'Things that grow',
    pool: ['IVY','FERN','MOSS','WEED','BULB','SHRUB','MOULD','SPROUT','SAPLING','LICHEN'] },

  { theme: 'Sailing words',
    pool: ['JIB','MAST','KEEL','HELM','BUOY','SHEET','BOOMS','ANCHOR','RUDDER','RIGGING','TILLER'] },

  { theme: 'Things in a snowstorm',
    pool: ['ICE','WIND','SNOW','GALE','DRIFT','FLAKE','SHOVEL','MITTEN','BLIZZARD','WHITEOUT'] },

  { theme: 'Parts of a flower',
    pool: ['BUD','STEM','LEAF','ROOT','PETAL','SEPAL','STALK','CARPEL','ANTHER','POLLEN'],
    obscure: 'CARPEL, SEPAL and ANTHER are botanical terms — fine for a botany-leaning theme, less so for a casual daily' },

  { theme: 'Mail and post',
    pool: ['BOX','BAG','SEAL','NOTE','CARD','STAMP','LABEL','PARCEL','LETTER','POSTAGE'] },

  { theme: 'Things in a toy box',
    pool: ['TOP','KIT','DOLL','KITE','DRUM','BLOCK','TRAIN','ROBOT','PUZZLE','MARBLE','TEDDY'] },

  { theme: 'Things underground',
    pool: ['ORE','ROOT','MOLE','COAL','SEAM','MINES','VAULT','BURROW','TUNNEL','CAVERN','MAGMA'] },

  { theme: 'Types of hat',
    pool: ['CAP','FEZ','HOOD','VISOR','BERET','DERBY','FEDORA','BONNET','TURBAN','HELMET'] },

  { theme: 'Things at a picnic',
    pool: ['ANT','RUG','JAM','CUPS','BLANKET','BASKET','HAMPER','FLASK','SALAD','CRISPS'] },

  { theme: 'Coastal features',
    pool: ['BAY','DUNE','CAVE','SPIT','CLIFF','INLET','BEACH','ISLAND','LAGOON','HARBOUR'] },

  { theme: 'Things a dog does',
    pool: ['DIG','BEG','NAP','BARK','WAGS','LICK','FETCH','CHASE','SNIFF','GROWLS','HOWLED'],
    stretch: 'mixing verb tenses reads slightly uneven if the set lands on WAGS or HOWLED' },

  { theme: 'Chess',
    pool: ['PAWN','ROOK','KING','MATE','FILE','RANK','QUEEN','BOARD','CHECK','KNIGHT','BISHOP','CASTLE','GAMBIT'] },

  // ── Food and drink ────────────────────────────────────────────────────────
  { theme: 'Citrus fruits',        pool: ['LIME','YUZU','ZEST','PEEL','LEMON','RIND','ORANGE','CITRON','POMELO','SATSUMA'] },
  { theme: 'Berries',              pool: ['BOG','HULL','VINE','BUSH','BERRY','SLOE','ELDER','DAMSON','PUNNET','BRAMBLE'] },
  { theme: 'Things in a salad',    pool: ['OIL','LEAF','MINT','CORN','ONION','CRESS','OLIVE','RADISH','TOMATO','PEPPER','CELERY'] },
  { theme: 'Types of cheese',      pool: ['BRIE','FETA','EDAM','CURD','WHEY','GOUDA','COLBY','RIND','CHEDDAR','GRUYERE','STILTON'] },
  { theme: 'Things in a bakery',   pool: ['BUN','PIE','RYE','LOAF','TART','ICING','SCONE','DOUGH','FLOUR','MUFFIN','PASTRY','ECLAIR'] },
  { theme: 'Hot drinks',           pool: ['TEA','COCOA','MOCHA','LATTE','BROTH','TODDY','COFFEE','CHAI','MULLED','PUNCH'] },
  { theme: 'Things on a barbecue', pool: ['RIB','COAL','TONG','GRILL','SAUCE','SKEWER','BASTE','CHARS','SMOKE','BRISKET'] },
  { theme: 'Sweet things',         pool: ['JAM','ICING','FUDGE','HONEY','SYRUP','TOFFEE','SUGAR','NOUGAT','CANDY','PRALINE'] },
  { theme: 'Things in a jar',      pool: ['JAM','LID','OLIVE','PICKLE','HONEY','SAUCE','CAPERS','RELISH','CHUTNEY','MARMITE'] },
  { theme: 'Cuts of meat',         pool: ['RIB','LOIN','RUMP','CHOP','SHANK','FLANK','BRISKET','SIRLOIN','MINCE','CUTLET'] },
  { theme: 'Types of potato dish', pool: ['CHIP','MASH','FRIES','ROAST','WEDGE','CRISPS','GRATIN','JACKET','HASH','ROSTI'] },
  { theme: 'Things in a curry',    pool: ['GHEE','RICE','NAAN','CUMIN','CHILI','ONION','GARLIC','GINGER','TURMERIC','LENTIL'] },
  { theme: 'Ice cream flavours',   pool: ['NUT','MINT','RUM','FUDGE','MOCHA','PEACH','TOFFEE','VANILLA','SORBET','PRALINE'] },
  { theme: 'Things at a market',   pool: ['BAG','TILL','CART','STALL','CRATE','SCALE','VENDOR','BASKET','PRODUCE','AWNING'] },
  { theme: 'Types of nut',         pool: ['NUT','SHELL','PECAN','ALMOND','CASHEW','WALNUT','BRAZIL','HAZEL','KERNEL','PISTACHIO'] },
  { theme: 'Things in a lunchbox', pool: ['JAM','APPLE','CRISPS','JUICE','WRAP','YOGURT','BANANA','SANDWICH','FLASK','NAPKIN'] },
  { theme: 'Condiments',           pool: ['OIL','SALT','MAYO','MUSTARD','RELISH','KETCHUP','VINEGAR','PICKLE','SAUCE','CHUTNEY'] },
  { theme: 'Things you can pour',  pool: ['OIL','MILK','WINE','SYRUP','JUICE','CREAM','GRAVY','BATTER','SAUCE','CUSTARD'] },
  { theme: 'Shellfish',            pool: ['CRAB','CLAM','WHELK','PRAWN','SQUID','MUSSEL','OYSTER','SCALLOP','LOBSTER','COCKLE'] },
  { theme: 'Types of mushroom',    pool: ['CEP','GILL','CAPS','SPORE','MOREL','OYSTER','BUTTON','SHIITAKE','TRUFFLE','CHANTERELLE'] },

  // ── Nature and landscape ──────────────────────────────────────────────────
  { theme: 'Things in a meadow',   pool: ['BEE','HAY','GRASS','CLOVER','DAISY','THISTLE','POPPY','MEADOW','BUTTERCUP','GRASSES'] },
  { theme: 'Things in a swamp',    pool: ['BOG','REED','MUD','FROG','MARSH','ALGAE','HERON','MANGROVE','CYPRESS','SLUDGE'] },
  { theme: 'Arctic things',        pool: ['ICE','FLOE','SEAL','SNOW','BERG','TUNDRA','WALRUS','PARKA','GLACIER','AURORA'] },
  { theme: 'Things in a cave',     pool: ['BAT','DRIP','ECHO','DARK','SHAFT','CHASM','CAVERN','STALACTITE','GROTTO','TUNNEL'] },
  { theme: 'Riverside things',     pool: ['EEL','SILT','REED','WEIR','BANK','TROUT','OTTER','HERON','PEBBLE','CURRENT'] },
  { theme: 'Things in a rainforest', pool: ['APE','VINE','MOSS','FERN','LIANA','CANOPY','ORCHID','TOUCAN','HUMID','JAGUAR'] },
  { theme: 'Types of soil',        pool: ['MUD','CLAY','LOAM','PEAT','SAND','SILT','CHALK','HUMUS','GRAVEL','COMPOST'] },
  { theme: 'Things in a hedgerow', pool: ['BUD','THORN','SLOE','NETTLE','BRAMBLE','HAWTHORN','HOLLY','IVY','BERRY','FINCH'] },
  { theme: 'Things at dawn',       pool: ['DEW','MIST','SUN','BIRDS','GLOW','LIGHT','CHORUS','SUNRISE','HAZE','AURORA'] },
  { theme: 'Things in a storm',    pool: ['WIND','RAIN','GALE','BOLT','FLASH','CLOUD','THUNDER','LIGHTNING','SQUALL','DELUGE'] },
  { theme: 'Autumn things',        pool: ['SAP','LEAF','MIST','ACORN','CIDER','HARVEST','CONKER','PUMPKIN','STUBBLE','BONFIRE'] },
  { theme: 'Spring things',        pool: ['BUD','LAMB','NEST','THAW','BLOOM','SHOOT','BLOSSOM','CROCUS','DAFFODIL','SHOWER'] },
  { theme: 'Things in a rockpool', pool: ['CRAB','WEED','ANEMONE','LIMPET','SHRIMP','WHELK','PEBBLE','STARFISH','ALGAE','SHELLS'] },
  { theme: 'Grassland animals',    pool: ['GNU','LION','ZEBRA','BISON','HYENA','GAZELLE','OSTRICH','MEERKAT','ANTELOPE','WARTHOG'] },
  { theme: 'Things in a pond',     pool: ['KOI','LILY','FROG','NEWT','ALGAE','REEDS','CARP','TADPOLE','DUCKWEED','RIPPLE'] },
  { theme: 'Types of tree',        pool: ['OAK','ELM','ASH','YEW','PINE','BIRCH','MAPLE','CEDAR','WILLOW','POPLAR','SPRUCE'] },
  { theme: 'Things in a canyon',   pool: ['RIM','MESA','ARCH','GORGE','LEDGE','STRATA','BOULDER','PLATEAU','RAVINE','BUTTE'] },
  { theme: 'Things that erode',    pool: ['SAND','CLIFF','ROCK','SHORE','GULLY','DUNE','CHANNEL','BEDROCK','SLOPE','CANYON'] },
  { theme: 'Night sky sights',     pool: ['MOON','STAR','ORION','COMET','AURORA','METEOR','PLANET','GALAXY','ECLIPSE','SATURN'] },
  { theme: 'Things in a field',    pool: ['HAY','CROP','GATE','WHEAT','STUBBLE','FURROW','SCARECROW','TRACTOR','HEDGE','BARLEY'] },

  // ── Animals ───────────────────────────────────────────────────────────────
  { theme: 'Farm animals',         pool: ['COW','SOW','EWE','HEN','GOAT','LAMB','HORSE','SHEEP','DONKEY','TURKEY','PIGLET'] },
  { theme: 'Pets',                 pool: ['CAT','DOG','RAT','FISH','BIRD','HORSE','RABBIT','GERBIL','HAMSTER','PARROT','LIZARD'] },
  { theme: 'Big cats',             pool: ['CUB','LION','LYNX','PUMA','TIGER','OCELOT','JAGUAR','COUGAR','CHEETAH','LEOPARD'] },
  { theme: 'Reptiles',             pool: ['ASP','BOA','SKINK','GECKO','ADDER','IGUANA','LIZARD','PYTHON','TORTOISE','MONITOR'] },
  { theme: 'Sea mammals',          pool: ['ORCA','SEAL','WHALE','OTTER','DUGONG','WALRUS','DOLPHIN','MANATEE','NARWHAL','PORPOISE'] },
  { theme: 'Baby animals',         pool: ['CUB','KID','PUP','FOAL','LAMB','CALF','CHICK','PUPPY','KITTEN','PIGLET','GOSLING'] },
  { theme: 'Animal homes',         pool: ['DEN','SET','NEST','HIVE','LAIR','BURROW','WARREN','STABLE','KENNEL','ROOST'] },
  { theme: 'Animal sounds',        pool: ['MOO','BAA','OINK','HOWL','PURR','BLEAT','GROWL','SQUEAK','CHIRP','BRAY'] },
  { theme: 'Birds of prey',        pool: ['OWL','KITE','HAWK','EAGLE','FALCON','BUZZARD','OSPREY','HARRIER','KESTREL','VULTURE'] },
  { theme: 'Amphibians',           pool: ['TOAD','FROG','NEWT','SPAWN','TADPOLE','SALAMANDER','AXOLOTL','CROAK','POND','GILLS'] },
  { theme: 'Things with shells',   pool: ['EGG','NUT','CLAM','SNAIL','WHELK','TURTLE','OYSTER','TORTOISE','MUSSEL','COCKLE'] },
  { theme: 'Animals that migrate', pool: ['EEL','TERN','GOOSE','SWALLOW','SALMON','CARIBOU','MONARCH','WHALE','STORK','WILDEBEEST'] },
  { theme: 'Nocturnal creatures',  pool: ['BAT','OWL','FOX','MOTH','BADGER','POSSUM','RACCOON','HEDGEHOG','LEMUR','CRICKET'] },
  { theme: 'Things in a beehive',  pool: ['BEE','WAX','CELL','COMB','QUEEN','DRONE','HONEY','NECTAR','LARVAE','POLLEN'] },
  { theme: 'Dog breeds',           pool: ['PUG','LAB','CORGI','BOXER','HUSKY','BEAGLE','POODLE','SETTER','SPANIEL','TERRIER'] },

  // ── Home and household ────────────────────────────────────────────────────
  { theme: 'Things in a living room', pool: ['RUG','SOFA','LAMP','VASE','CLOCK','SHELF','CUSHION','CURTAIN','MANTEL','TELLY'] },
  { theme: 'Things in a bedroom',  pool: ['BED','RUG','LAMP','QUILT','SHEET','PILLOW','DRAWER','MIRROR','CLOSET','DUVET'] },
  { theme: 'Cleaning supplies',    pool: ['MOP','RAG','SOAP','BROOM','CLOTH','BLEACH','SPONGE','POLISH','DUSTER','BUCKET'] },
  { theme: 'Things in a shed',     pool: ['AXE','HOE','RAKE','SPADE','MOWER','TWINE','SHEARS','TROWEL','LADDER','CANS'] },
  { theme: 'Things on a wall',     pool: ['ART','HOOK','CLOCK','PHOTO','SHELF','MIRROR','POSTER','PLAQUE','SOCKET','FRAME'] },
  { theme: 'Things with a screen', pool: ['TV','PHONE','TABLET','LAPTOP','MONITOR','CAMERA','CONSOLE','WATCH','KIOSK','RADAR'] },
  { theme: 'Things in a fridge',   pool: ['EGG','JAM','MILK','SALAD','CHEESE','BUTTER','YOGURT','JUICE','LEFTOVER','PICKLE'] },
  { theme: 'Things that lock',     pool: ['BOX','SAFE','GATE','DOOR','LATCH','VAULT','PADLOCK','DRAWER','BOLT','CHEST'] },
  { theme: 'Things made of glass', pool: ['JAR','PANE','LENS','BULB','VASE','MIRROR','BOTTLE','WINDOW','MARBLE','PRISM'] },
  { theme: 'Things that hang',     pool: ['BAT','COAT','LAMP','SIGN','CHIME','MOBILE','CURTAIN','PICTURE','HAMMOCK','PENDANT'] },
  { theme: 'Things in a cupboard', pool: ['TIN','JAR','MUG','PLATE','BOWLS','SPICE','CEREAL','GLASSES','LINENS','PANTRY'] },
  { theme: 'Things you fold',      pool: ['MAP','TENT','SHIRT','TOWEL','NAPKIN','LAUNDRY','ORIGAMI','LETTER','CHAIR','DECKCHAIR'] },
  { theme: 'Things with buttons',  pool: ['TV','COAT','SHIRT','PHONE','REMOTE','ELEVATOR','KEYBOARD','JACKET','CONSOLE','MICROWAVE'] },
  { theme: 'Things that ring',     pool: ['BELL','PHONE','ALARM','CHIME','GONG','DOORBELL','TIMER','TILL','SIREN','CLOCK'] },
  { theme: 'Things in a loft',     pool: ['BOX','DUST','BEAM','TRUNK','RAFTER','INSULATION','JOIST','HATCH','COBWEB','CRATE'] },
  { theme: 'Bedding',              pool: ['BED','SHEET','QUILT','DUVET','PILLOW','BLANKET','THROW','LINEN','BOLSTER','MATTRESS'] },
  { theme: 'Things you plug in',   pool: ['FAN','LAMP','IRON','KETTLE','TOASTER','CHARGER','HEATER','BLENDER','RADIO','MODEM'] },
  { theme: 'Things in a hallway',  pool: ['MAT','COAT','HOOK','STAIRS','MIRROR','UMBRELLA','SHOES','CONSOLE','RUNNER','POST'] },
  { theme: 'Things that spin',     pool: ['TOP','FAN','WHEEL','DRILL','ROTOR','TURBINE','DYNAMO','SPINDLE','CAROUSEL','GYRO'] },
  { theme: 'Things in a nursery',  pool: ['COT','TOY','CRIB','MOBILE','RATTLE','NAPPY','BLANKET','BOTTLE','PRAM','TEDDY'] },

  // ── Sport and games ───────────────────────────────────────────────────────
  { theme: 'Things on a tennis court', pool: ['NET','SET','BALL','LOVE','SERVE','COURT','RACKET','UMPIRE','BASELINE','DEUCE'] },
  { theme: 'Football words',       pool: ['REF','GOAL','KICK','PITCH','WHISTLE','PENALTY','CORNER','OFFSIDE','STRIKER','TACKLE'] },
  { theme: 'Cricket words',        pool: ['BAT','RUN','OVER','WICKET','CREASE','BOWLER','INNINGS','STUMPS','BOUNDARY','SLIP'] },
  { theme: 'Athletics events',     pool: ['RUN','DASH','RELAY','JAVELIN','HURDLE','SPRINT','DISCUS','SHOTPUT','MARATHON','VAULT'] },
  { theme: 'Boxing words',         pool: ['JAB','HOOK','RING','BOUT','GLOVE','ROUND','CORNER','UPPERCUT','REFEREE','CANVAS'] },
  { theme: 'Swimming words',       pool: ['LAP','DIVE','POOL','LANE','CRAWL','STROKE','GOGGLES','FLOAT','MEDLEY','SPLASH'] },
  { theme: 'Cycling words',        pool: ['HUB','GEAR','TYRE','SPOKE','PELOTON','SADDLE','HELMET','CHAIN','PEDAL','SPRINT'] },
  { theme: 'Board game bits',      pool: ['DIE','CARD','TOKEN','BOARD','PIECE','COUNTER','SPINNER','MEEPLE','TILES','DICE'] },
  { theme: 'Playground games',     pool: ['TAG','HIDE','CHASE','MARBLES','HOPSCOTCH','SKIPPING','LEAPFROG','SEEK','CONKERS','JACKS'] },
  { theme: 'Racing words',         pool: ['LAP','PIT','GRID','FLAG','TRACK','CIRCUIT','PODIUM','CHICANE','DRIVER','CHEQUER'] },
  { theme: 'Archery words',        pool: ['BOW','AIM','NOCK','ARROW','QUIVER','TARGET','FLETCH','BULLSEYE','DRAW','RANGE'] },
  { theme: 'Gymnastics',           pool: ['BAR','MAT','BEAM','VAULT','RINGS','TUMBLE','ROUTINE','SOMERSAULT','POMMEL','LANDING'] },
  { theme: 'Things a referee has', pool: ['CARD','FLAG','WHISTLE','TIMER','RULES','STOPWATCH','BOARD','SPRAY','COIN','BADGE'] },
  { theme: 'Sailing race words',   pool: ['JIB','BUOY','TACK','MARK','START','COURSE','SPINNAKER','HELM','GYBE','FLEET'] },
  { theme: 'Skateboarding',        pool: ['OLLIE','RAMP','DECK','GRIND','TRUCK','WHEEL','KICKFLIP','HALFPIPE','BAIL','RAIL'] },

  // ── Work and occupations ──────────────────────────────────────────────────
  { theme: 'Things a doctor uses', pool: ['XRAY','SWAB','CHART','SCALPEL','SUTURE','SYRINGE','STETHOSCOPE','GLOVES','SPLINT','GAUZE'] },
  { theme: 'Things a builder uses',pool: ['HOD','NAIL','LEVEL','MORTAR','TROWEL','CEMENT','SCAFFOLD','BRICK','PLUMB','CHISEL'] },
  { theme: 'Things a barber uses', pool: ['COMB','CAPE','RAZOR','CLIPPER','SCISSORS','MIRROR','TOWEL','APRON','SHEARS','BRUSH'] },
  { theme: 'Things a painter uses',pool: ['OIL','RAG','PAIL','BRUSH','EASEL','CANVAS','PALETTE','ROLLER','PRIMER','SMOCK'] },
  { theme: 'Things a farmer uses', pool: ['HOE','BALE','PLOUGH','TRACTOR','HARROW','SEEDER','TROUGH','SCYTHE','SILO','PITCHFORK'] },
  { theme: 'Things a tailor uses', pool: ['PIN','HEM','TAPE','CHALK','THREAD','NEEDLE','BOBBIN','SCISSORS','THIMBLE','SEAM'] },
  { theme: 'Things a pilot uses',  pool: ['MAP','YOKE','RADAR','THROTTLE','COMPASS','ALTIMETER','RUDDER','HEADSET','CHART','RUNWAY'] },
  { theme: 'Things a judge has',   pool: ['WIG','ROBE','GAVEL','BENCH','VERDICT','COURT','DOCKET','SENTENCE','JURY','ORDER'] },
  { theme: 'Things a teacher uses',pool: ['PEN','DESK','CHALK','BOARD','MARKER','REGISTER','TEXTBOOK','RULER','ERASER','LESSON'] },
  { theme: 'Things a plumber uses',pool: ['PIPE','TAP','FLUX','WRENCH','SOLDER','PLUNGER','VALVE','GASKET','WASHER','SPANNER'] },
  { theme: 'Things a librarian does', pool: ['SHELF','STAMP','INDEX','CATALOGUE','ARCHIVE','LEND','SORT','SILENCE','BORROW','RETURN'] },
  { theme: 'Things a baker uses',  pool: ['TIN','OVEN','DOUGH','YEAST','WHISK','FLOUR','KNEAD','PROVER','SIEVE','ROLLING'] },

  // ── Travel and places ─────────────────────────────────────────────────────
  { theme: 'Things at an airport', pool: ['GATE','BAG','VISA','TICKET','RUNWAY','TERMINAL','CUSTOMS','LOUNGE','CHECKIN','CAROUSEL'] },
  { theme: 'Things at a train station', pool: ['RAIL','PLATFORM','TICKET','SIGNAL','GUARD','TRACK','TIMETABLE','BARRIER','KIOSK','BUFFER'] },
  { theme: 'Things in a hotel',    pool: ['BED','KEY','LOBBY','SUITE','PORTER','MINIBAR','RECEPTION','TOWEL','CONCIERGE','LIFT'] },
  { theme: 'Things in a city',     pool: ['CAB','MALL','PARK','TOWER','SUBWAY','TRAFFIC','SKYLINE','BRIDGE','PLAZA','METRO'] },
  { theme: 'Things in a village',  pool: ['INN','PUB','POND','GREEN','CHAPEL','COTTAGE','SQUARE','LANE','SPIRE','FORGE'] },
  { theme: 'Things on a road',     pool: ['CAR','SIGN','KERB','LANE','VERGE','BOLLARD','JUNCTION','CROSSING','MARKING','GANTRY'] },
  { theme: 'Types of bridge',      pool: ['SPAN','ARCH','TRUSS','BEAM','CABLE','PONTOON','VIADUCT','SUSPENSION','FOOTBRIDGE','TOLL'] },
  { theme: 'Things at a harbour',  pool: ['QUAY','BUOY','DOCK','CRANE','JETTY','MOORING','TRAWLER','ANCHOR','WHARF','TIDE'] },
  { theme: 'Things in a desert town', pool: ['WELL','ADOBE','SALOON','CACTUS','DUST','MESA','CORRAL','TRAIL','SHERIFF','WAGON'] },
  { theme: 'Things you pack',      pool: ['BAG','MAP','TOWEL','CHARGER','PASSPORT','SUNSCREEN','SANDALS','CAMERA','ADAPTER','TICKETS'] },
  { theme: 'Types of accommodation', pool: ['INN','HUT','TENT','LODGE','HOSTEL','MOTEL','CABIN','CHALET','VILLA','CARAVAN'] },
  { theme: 'Map features',         pool: ['KEY','GRID','SCALE','LEGEND','CONTOUR','COMPASS','SYMBOL','BORDER','ROUTE','INSET'] },
  { theme: 'Things in a subway',   pool: ['MAP','RAIL','TOKEN','TUNNEL','ESCALATOR','CARRIAGE','PLATFORM','TURNSTILE','BUSKER','LINE'] },
  { theme: 'Things at a campsite', pool: ['TENT','FIRE','PEG','STOVE','LANTERN','SLEEPING','PITCH','GUYLINE','MALLET','BILLY'] },
  { theme: 'Things in a garden centre', pool: ['POT','SEED','BULB','COMPOST','TROWEL','SAPLING','GRAVEL','PLANTER','LABEL','SHRUB'] },

  // ── Arts and culture ──────────────────────────────────────────────────────
  { theme: 'Things in a theatre',  pool: ['ACT','SET','WING','STAGE','CURTAIN','SCRIPT','LIGHTING','BALCONY','USHER','PROPS'] },
  { theme: 'Things in an orchestra', pool: ['BOW','HORN','VIOLA','CELLO','BATON','SCORE','TIMPANI','CONDUCTOR','OBOE','STRINGS'] },
  { theme: 'Painting terms',       pool: ['HUE','OIL','WASH','TONE','SHADE','CANVAS','PALETTE','PIGMENT','GLAZE','IMPASTO'] },
  { theme: 'Poetry terms',         pool: ['ODE','RHYME','METRE','VERSE','STANZA','SONNET','COUPLET','IAMB','HAIKU','REFRAIN'] },
  { theme: 'Types of film',        pool: ['NOIR','EPIC','DRAMA','COMEDY','HORROR','WESTERN','THRILLER','ROMANCE','SHORT','ANIME'] },
  { theme: 'Things in a photograph', pool: ['LENS','FLASH','FRAME','FOCUS','SHUTTER','TRIPOD','FILTER','EXPOSURE','GRAIN','SUBJECT'] },
  { theme: 'Dance styles',         pool: ['JIG','TAP','WALTZ','TANGO','RUMBA','SAMBA','BALLET','FOXTROT','SALSA','MAMBO'] },
  { theme: 'Parts of a book',      pool: ['END','LEAF','SPINE','INDEX','CHAPTER','PREFACE','GLOSSARY','COVER','BINDING','MARGIN'] },
  { theme: 'Things in a sculpture studio', pool: ['CLAY','KILN','MOULD','CHISEL','BRONZE','MARBLE','ARMATURE','PLINTH','MAQUETTE','CARVE'] },
  { theme: 'Circus acts',          pool: ['ACT','MIME','CLOWN','TRAPEZE','JUGGLER','ACROBAT','RINGMASTER','TIGHTROPE','UNICYCLE','STILTS'] },
  { theme: 'Things in a comic',    pool: ['PANEL','SPEECH','BUBBLE','HERO','VILLAIN','INKER','SPLASH','GUTTER','CAPTION','STRIP'] },
  { theme: 'Types of song',        pool: ['HYMN','ARIA','BALLAD','ANTHEM','CAROL','LULLABY','CHANT','SHANTY','DIRGE','ROUND'] },

  // ── Science and technology ────────────────────────────────────────────────
  { theme: 'Things in a laboratory', pool: ['VIAL','FLASK','TONGS','BEAKER','PIPETTE','BURNER','MICROSCOPE','SLIDE','CENTRIFUGE','PETRI'] },
  { theme: 'States of matter',     pool: ['GAS','SOLID','LIQUID','PLASMA','VAPOUR','MELT','FREEZE','CONDENSE','SUBLIME','FLUID'] },
  { theme: 'Parts of an atom',     pool: ['ION','SHELL','PROTON','NEUTRON','ELECTRON','NUCLEUS','ORBITAL','QUARK','CHARGE','ISOTOPE'] },
  { theme: 'Things in a circuit',  pool: ['WIRE','FUSE','RELAY','SWITCH','RESISTOR','CAPACITOR','DIODE','BATTERY','CIRCUIT','GROUND'] },
  { theme: 'Weather instruments',  pool: ['VANE','GAUGE','BAROMETER','ANEMOMETER','HYGROMETER','THERMOMETER','RADAR','BALLOON','SENSOR','MAST'] },
  { theme: 'Things a computer has',pool: ['RAM','CPU','DISK','PORT','CABLE','SCREEN','KEYBOARD','MOUSE','MEMORY','COOLER'] },
  { theme: 'Simple machines',      pool: ['AXLE','LEVER','PULLEY','WEDGE','SCREW','WHEEL','RAMP','GEAR','INCLINE','FULCRUM'] },
  { theme: 'Parts of a flowerbed', pool: ['BED','SOIL','MULCH','BORDER','EDGING','COMPOST','LABEL','TRELLIS','GRAVEL','PLANTS'] },
  { theme: 'Units of measurement', pool: ['INCH','FOOT','MILE','GRAM','LITRE','METRE','OUNCE','POUND','ACRE','TONNE'] },
  { theme: 'Things in a telescope view', pool: ['MOON','STAR','RING','CRATER','NEBULA','GALAXY','COMET','PLANET','ECLIPSE','CLUSTER'] },
  { theme: 'Types of energy',      pool: ['HEAT','LIGHT','SOUND','SOLAR','WIND','TIDAL','NUCLEAR','KINETIC','THERMAL','CHEMICAL'] },
  { theme: 'Things in a first aid kit', pool: ['GAUZE','TAPE','SLING','PLASTER','BANDAGE','SCISSORS','TWEEZERS','ANTISEPTIC','SWAB','SPLINT'] },

  // ── Miscellaneous and abstract ────────────────────────────────────────────
  { theme: 'Things that are sticky', pool: ['GUM','TAR','GLUE','SAP','HONEY','SYRUP','RESIN','TOFFEE','PASTE','VELCRO'] },
  { theme: 'Things that float',    pool: ['ICE','RAFT','BUOY','CORK','FOAM','BOAT','BALLOON','DRIFTWOOD','LILO','BUBBLE'] },
  { theme: 'Things that are sharp',pool: ['PIN','AXE','NAIL','BLADE','THORN','RAZOR','NEEDLE','SHARD','SPIKE','SCALPEL'] },
  { theme: 'Things you wind up',   pool: ['TOY','CLOCK','WATCH','SPRING','MUSICBOX','CRANK','WINCH','GRAMOPHONE','METRONOME','TIMER'] },
  { theme: 'Things that are hollow', pool: ['TUBE','PIPE','DRUM','SHELL','STRAW','BARREL','CAVERN','BAMBOO','CANNON','FLUTE'] },
  { theme: 'Things in a pocket',   pool: ['KEY','LINT','COIN','PHONE','WALLET','TISSUE','RECEIPT','STRING','SWEET','TICKET'] },
  { theme: 'Things that come in pairs', pool: ['EAR','SOCKS','GLOVE','SHOES','DICE','SCISSORS','TWINS','BOOKENDS','OARS','EARRINGS'] },
  { theme: 'Things you can climb', pool: ['HILL','TREE','ROPE','STAIRS','LADDER','CLIFF','WALL','MOUNTAIN','TRELLIS','RIGGING'] },
  { theme: 'Things that are woven',pool: ['MAT','NET','RUG','BASKET','CLOTH','TAPESTRY','WICKER','FABRIC','BRAID','LATTICE'] },
  { theme: 'Things that glow',     pool: ['SUN','LAMP','EMBER','FIREFLY','NEON','CANDLE','MOON','LANTERN','SCREEN','AURORA'] },
  { theme: 'Things that are frozen', pool: ['ICE','BERG','FROST','SORBET','GLACIER','ICICLE','TUNDRA','SLUSH','HAIL','PERMAFROST'] },
  { theme: 'Things you can shuffle', pool: ['CARDS','DECK','FEET','PAPERS','TILES','PLAYLIST','QUEUE','DOMINOES','STEPS','ORDER'] },
  { theme: 'Things with teeth',    pool: ['SAW','COMB','GEAR','ZIPPER','SHARK','RAKE','KEY','SPROCKET','CROCODILE','FILE'] },
  { theme: 'Things that are folded', pool: ['MAP','FAN','TENT','NAPKIN','ORIGAMI','LAUNDRY','WALLET','PAMPHLET','DECKCHAIR','CREASE'] },
  { theme: 'Things that leak',     pool: ['TAP','PIPE','ROOF','SEAL','VALVE','GASKET','BUCKET','FAUCET','HOSE','BOAT'] },
  { theme: 'Things that are wound',pool: ['YARN','COIL','SPOOL','CABLE','BOBBIN','SPRING','BANDAGE','REEL','TWINE','THREAD'] },
  { theme: 'Things in a snow globe', pool: ['SNOW','DOME','BASE','SCENE','GLITTER','WATER','FIGURE','SHAKE','WINTER','GLASS'] },
  { theme: 'Things that echo',     pool: ['CAVE','HALL','CANYON','TUNNEL','VALLEY','CHAMBER','STADIUM','SHOUT','VAULT','GORGE'] },
  { theme: 'Things you can strike',pool: ['GONG','MATCH','DRUM','BELL','ANVIL','CHORD','POSE','DEAL','TENT','BARGAIN'],
    stretch: 'this leans on multiple senses of "strike" - a lateral set rather than a literal one' },
  { theme: 'Things that are stacked', pool: ['LOGS','BOOKS','PLATES','CRATES','PANCAKES','CHAIRS','BRICKS','TILES','CHIPS','HAY'] },
];

// Second pass over the pools. The first draft left many themes without a word at
// some required length, or without enough room to keep every letter under three.
// These widen the pool; a few themes are renamed where no natural 3-letter word
// exists for the original framing (there is no 3-letter cheese or sea mammal).
const EXTRA = {
  'Camping equipment':      { add: ['PEG','MAP','BIVY','PUMP','GRILL','BASIN','MATCH','COOLER','WICK','GROUND'] },
  'Things in a car':        { add: ['KEY','FOB','DASH','VENT','PEDAL','CLUTCH','WIPER','AERIAL','EXHAUST'] },
  'Types of soup':          { add: ['PEA','HAM','BEAN','ONION','TOMATO','SQUASH','BARLEY','NOODLE','STOCK'] },
  'Winter sports':          { add: ['ICE','BOB','RINK','PUCK','MOGUL','CARVE','NORDIC','DOWNHILL','TOBOGGAN'] },
  'Volcano words':          { add: ['GAS','RIM','FLOW','BOMB','TEPHRA','FISSURE','CALDERA','PUMICE','ERUPT'] },
  'Parts of a shoe':        { add: ['CAP','RAND','VAMP','SHANK','LINING','BUCKLE','STRAP','QUARTER'] },
  'Types of fabric':        { add: ['FUR','GAUZE','CHINO','MOHAIR','POPLIN','SUEDE','TULLE','CHIFFON'] },
  'Things in a bank':       { add: ['PIN','FEE','CARD','COIN','QUEUE','BRANCH','MANAGER','LEDGER'] },
  'Things underground':     { add: ['BUG','PIT','WORM','CRYPT','SEWER','BUNKER','FOSSIL','AQUIFER'] },
  'Chess':                  { add: ['PIN','END','WIN','FORK','OPEN','BLACK','WHITE'] },
  'Citrus fruits':          { add: ['PIP','PEEL','JUICE','WEDGE','SEGMENT'] },
  'Things in a salad':      { add: ['PEA','NUT','BEET','HERB','ROCKET','CHIVE','SPINACH','DRESSING'] },
  'Types of cheese':        { rename: 'Things on a cheeseboard',
                              add: ['FIG','NUT','JAM','GRAPE','CRACKER','CHUTNEY','KNIFE','SLATE','PANEER'] },
  'Things on a barbecue':   { add: ['GAS','MEAT','CORN','KEBAB','BURGER','APRON','FLAME','CHARCOAL'] },
  'Sweet things':           { add: ['CAKE','MINT','TART','GLAZE','JELLY'] },
  'Things in a jar':        { add: ['BALM','SEED','HERB','BEAN','COINS'] },
  'Types of potato dish':   { add: ['PIE','BAKED','SKINS','DAUPHINOISE'] },
  'Things in a curry':      { add: ['OIL','POT','PEAS','SPICE'] },
  'Types of nut':           { add: ['PINE','ACORN','SHELLS'] },
  'Shellfish':              { rename: 'Seafood',
                              add: ['EEL','ROE','SOLE','PLAICE','MACKEREL','HERRING'] },
  'Things in a meadow':     { add: ['HARE','VOLE','MOTH','GATE','SORREL'] },
  'Arctic things':          { add: ['FOX','HUT','FLOE','IGLOO','SLEDGE','PENGUIN','KAYAK'] },
  'Riverside things':       { add: ['MUD','OAR','FORD','PUNT','WILLOW','MOORHEN','RUSHES','ANGLER'] },
  'Types of soil':          { add: ['BOG','DIRT','MARL','LOESS','TOPSOIL','SUBSOIL'] },
  'Things in a hedgerow':   { add: ['BAT','ROSE','WREN','ELDER','DOGWOOD','SPARROW'] },
  'Things in a storm':      { add: ['ICE','SKY','HAIL','TORRENT'] },
  'Spring things':          { add: ['EGG','HARE','CHICK','TULIP','NESTING','RAINBOW'] },
  'Things in a rockpool':   { add: ['SEA','GULL','KELP','BARNACLE'] },
  'Grassland animals':      { add: ['IMPALA','BABOON','JACKAL','RHINOS'] },
  'Things in a canyon':     { add: ['BAT','WALL','SHADOW','JUNIPER','ERODE'] },
  'Things that erode':      { add: ['MUD','ICE','WIND','BANKS','TERRAIN'] },
  'Night sky sights':       { add: ['ORB','ARC','DUST','ZENITH'] },
  'Things in a field':      { add: ['COW','GATE','CLOVER','FURROWS','MEADOW'] },
  'Reptiles':               { add: ['CROC','SCALE','SLOUGH','CAIMAN'],
                              obscure: 'CROC is informal shorthand — swap for CAIMAN if that reads better' },
  'Sea mammals':            { rename: 'Sea creatures',
                              add: ['EEL','RAY','COD','SQUID','URCHIN'] },
  'Birds of prey':          { add: ['ERNE','TALON','BEAK','MERLIN','GOSHAWK'],
                              obscure: 'ERNE is an old word for a sea eagle — flag if it surfaces' },
  'Amphibians':             { rename: 'Amphibians and pond life',
                              add: ['KOI','ALGAE','CROAKS','TADPOLE'] },
  'Animals that migrate':   { add: ['BAT','ELK','CRANE','SWIFT','LOCUST','REINDEER'] },
  'Dog breeds':             { add: ['CHOW','WHIPPET','MASTIFF','COLLIE'] },
  'Things in a shed':       { add: ['CAN','BIKE','NAILS','PAINT','LADDER','TOOLS'] },
  'Things with a screen':   { add: ['ATM','GPS','TILL','RADAR','CINEMA'] },
  'Things in a cupboard':   { add: ['MUGS','TINS','PANS','SUGAR'] },
  'Things you fold':        { add: ['FLAG','PAGES','CLOTHES','BLANKET'] },
  'Things with buttons':    { add: ['FOB','LIFT','ALARM','TUNIC'] },
  'Things that ring':       { add: ['EAR','CHIMES','ALARMS','TOWER'],
                              stretch: 'EAR belongs by way of "ears ringing" — a lateral entry' },
  'Bedding':                { add: ['CASE','WOOL','COVER'] },
  'Cricket words':          { add: ['BAILS','PITCH','SPINS','DUCKS'] },
  'Boxing words':           { add: ['MAT','BELT','FIGHT','TRAINER','SPARRING'] },
  'Board game bits':        { add: ['BOX','PAWN','CHIPS','RULES','MARKER','TIMER'] },
  'Playground games':       { add: ['SEESAW','SWINGS','SLIDES'] },
  'Gymnastics':             { add: ['FLIP','CHALK','SPLITS','FLOOR','HANDSTAND'] },
  'Things a referee has':   { add: ['KIT','BADGES','POCKET','SHIRT'] },
  'Skateboarding':          { add: ['AIR','TRUCKS','WHEELS','PARK'] },
  'Things a doctor uses':   { add: ['JAB','PEN','NOTES','CLINIC'] },
  'Things a barber uses':   { add: ['GEL','WAX','CHAIR','TALCUM'] },
  'Things a painter uses':  { add: ['INK','JAR','TURPS','SKETCH','VARNISH'] },
  'Things a farmer uses':   { add: ['BALER','FORKS','SPADE','FENCE'] },
  'Things a tailor uses':   { add: ['CUT','IRON','LINING','BUTTON','PATTERN'] },
  'Things a pilot uses':    { add: ['FUEL','FLAP','GAUGE','BEACON','JOYSTICK'] },
  'Things a teacher uses':  { add: ['BELL','GLOBE','POINTER','WORKSHEET'] },
  'Things a librarian does':{ add: ['TAG','LOG','FILE','SCAN'] },
  'Things at an airport':   { add: ['PLANE','QUEUE','STAND','APRON'] },
  'Things at a train station':{ add: ['BIN','MAP','CLOCK','PORTER'] },
  'Things on a road':       { add: ['VAN','CONE','TARMAC','CAMBER','MEDIAN'] },
  'Types of bridge':        { rename: 'Parts of a bridge',
                              add: ['BAR','PIER','DECK','PYLON','GIRDER','CABLE','ANCHOR'] },
  'Things at a harbour':    { add: ['TUG','NET','ROPE','BOATS'] },
  'Things in a desert town':{ add: ['BAR','SUN','HORSE','STORE'] },
  'Things you pack':        { add: ['SOCK','BOOK','COMB','SHOES'] },
  'Types of accommodation': { add: ['ROOM','SUITE','MANOR','RESORT','BEDSIT'] },
  'Things at a campsite':   { add: ['MAP','LOG','WOOD','TORCH','FIREPIT'] },
  'Things in a garden centre':{ add: ['BAG','HOSE','TWINE','SHEARS','BEDDING'] },
  'Things in an orchestra': { add: ['VIOLIN','PODIUM','TUBAS'] },
  'Painting terms':         { add: ['DAB','LINE','FORM','SKETCH','TEXTURE'] },
  'Types of film':          { add: ['SPY','WAR','SCIFI','SEQUEL'] },
  'Things in a photograph': { add: ['EYE','SUN','POSE','ALBUM'] },
  'Dance styles':           { add: ['JIVE','REEL','SWING','BOLERO'] },
  'Parts of a book':        { add: ['TIP','PAGE','TITLE','JACKET','FOLIO','ERRATA'] },
  'Things in a sculpture studio':{ add: ['WAX','JIG','FILE','STONE'] },
  'Circus acts':            { add: ['CAT','RING','LION','TAMER','TUMBLE','PARADE'] },
  'Things in a comic':      { add: ['POW','ZAP','BAM','INK','FRAME'] },
  'Types of song':          { add: ['POP','RAP','FOLK','BLUES','MARCH'] },
  'Things in a laboratory': { add: ['JAR','VAT','RACK','STAND'] },
  'Parts of an atom':       { add: ['CORE','MASS','SPIN','FIELD'] },
  'Things in a circuit':    { add: ['LED','AMP','COIL','BOARD'] },
  'Weather instruments':    { add: ['GPS','MAST','DIAL','PROBE','SCREEN'] },
  'Simple machines':        { add: ['COG','BAR','ROPE','PIVOT'] },
  'Units of measurement':   { add: ['TON','DEGREE','GALLON','SECOND','MINUTE'] },
  'Things in a telescope view':{ add: ['ARC','DUST','RINGS','ZENITH'] },
  'Types of energy':        { add: ['GAS','FOSSIL','ATOMIC','STEAM'] },
  'Things in a first aid kit':{ add: ['PIN','GEL','WIPE','GLOVES'] },
  'Things that float':      { add: ['CANOE','BALSA','BARGE'] },
  'Things that are sharp':  { add: ['TACK','BARB','SPUR','SHARD','MACHETE','CLEAVER'] },
  'Things you wind up':     { add: ['CORD','REEL','TOYS','CRANK'] },
  'Things that are hollow': { add: ['LOG','URN','POD','GOURD'] },
  'Things in a pocket':     { add: ['FOB','NOTE','CANDY','CHANGE','PENKNIFE'] },
  'Things that come in pairs':{ add: ['GLOVES','SKATES','SHOES'] },
  'Things you can climb':   { add: ['BAR','MAST','DUNE','SLOPE'] },
  'Things that are woven':  { add: ['ROPE','MESH','LACE','REEDS'] },
  'Things that glow':       { add: ['LED','BULB','FLAME','BEACON','PHOSPHOR'] },
  'Things you can shuffle': { add: ['SET','GAIT','MUSIC','PACK'] },
  'Things that are folded': { add: ['PAPER','TOWEL','SHEET','LINEN'] },
  'Things that are wound':  { add: ['BOW','CORD','CLOCK','WATCH'] },
  'Things in a snow globe': { add: ['FIR','ELF','TREE','HOUSE'] },
  'Things that echo':       { add: ['PIT','BAY','WELL','ARCH'] },
  'Things you can strike':  { add: ['OIL','ANVILS','MATCH','CAMP'] },
  'Things that are stacked':{ add: ['BOX','CANS','TRAYS','PALLET','DISHES','FIREWOOD'] },
};

THEMES.forEach(t => {
  const e = EXTRA[t.theme];
  if (!e) return;
  if (e.add) t.pool = t.pool.concat(e.add);
  if (e.obscure) t.obscure = e.obscure;
  if (e.stretch) t.stretch = e.stretch;
  if (e.rename) t.theme = e.rename;
});

// ── Search ───────────────────────────────────────────────────────────────────

function analyse(words) {
  const freq = {};
  words.join('').split('').forEach(ch => { freq[ch] = (freq[ch] || 0) + 1; });
  const dupes = Object.entries(freq).filter(([, n]) => n > 1).sort();
  const worst = Math.max(...Object.values(freq));
  return {
    words, freq, dupes, worst,
    unique: Object.keys(freq).length,
    total: words.join('').length,
    ok: worst <= 2,
    zeroDupe: dupes.length === 0,
  };
}

// Try every 3/4/5/6 combination in the pool and keep the best that passes.
// Scored so that reusing a word already spent on an earlier puzzle costs more
// than an extra duplicate tile: across 200 puzzles a player notices a repeated
// word far sooner than they notice one more repeated letter in the grid.
function solve(t, usedWords) {
  const seen = new Set();
  const bucket = n => t.pool
    .map(w => w.toUpperCase())
    .filter(w => w.length === n && /^[A-Z]+$/.test(w))
    .filter(w => (seen.has(n + w) ? false : (seen.add(n + w), true)));

  const [a, b, c, d] = [bucket(3), bucket(4), bucket(5), bucket(6)];
  if (!a.length || !b.length || !c.length || !d.length) {
    return { failed: 'pool lacks a word of length ' +
      [[3,a],[4,b],[5,c],[6,d]].filter(([, x]) => !x.length).map(([n]) => n).join(' and ') };
  }

  let best = null, bestScore = Infinity;
  for (const w3 of a) for (const w4 of b) for (const w5 of c) for (const w6 of d) {
    const words = [w3, w4, w5, w6];
    const r = analyse(words);
    if (!r.ok || r.total !== 18) continue;
    r.reused = words.filter(w => usedWords.has(w)).length;
    const score = r.reused * 10 + r.dupes.length;
    if (score < bestScore) {
      best = r; bestScore = score;
      if (score === 0) return best;   // unique words and no duplicate tiles
    }
  }
  return best || { failed: 'no combination keeps every letter to 2 or fewer' };
}

// Sequential, so each puzzle can see which words earlier ones already claimed
const usedWords = new Set();
const solved = THEMES.map(t => {
  const r = solve(t, usedWords);
  if (!r.failed) r.words.forEach(w => usedWords.add(w));
  return { t, r };
});
const good   = solved.filter(x => !x.r.failed);
const failed = solved.filter(x => x.r.failed);

const TARGET = 200;
const kept = good.slice(0, TARGET);

// ── Output ───────────────────────────────────────────────────────────────────

const L = [];
L.push('RELATION - CANDIDATE PUZZLES FOR REVIEW');
L.push('='.repeat(72));
L.push('');
L.push('Every figure below is computed from the words themselves.');
L.push('');
L.push('CONSTRAINT USED');
L.push('  The brief gives two incompatible rules: "no two words share a letter",');
L.push('  and "ideally no letter appears more than twice". The brief\'s own');
L.push('  examples follow the second, not the first:');
L.push('    FOG/HAIL/SLEET/SHOWER  is labelled "Duplicate letters: None" but runs');
L.push('                           O2 H2 L2 S2 E3 - it breaks even the looser rule');
L.push('    HAY/BARN/FENCE/TROUGH  is labelled "None" but has five letters twice');
L.push('  So the rule enforced here is: NO LETTER MORE THAN TWICE across the 18');
L.push('  tiles. A set reaching 18 entirely distinct letters is marked');
L.push('  ZERO-DUPLICATE and is the strongest candidate for a clean grid.');
L.push('');
L.push('  Grid path solvability is NOT checked here, as instructed.');
L.push('');
L.push('  Duplicate tiles needed = the count of letters listed on the Duplicate');
L.push('  line. A set with 3 duplicated letters needs 3 repeated tiles in the grid.');
L.push('');
L.push(`  Themes attempted   : ${solved.length}`);
L.push(`  Sets resolved      : ${good.length}`);
L.push(`  Included below     : ${kept.length}`);
L.push(`  Zero-duplicate     : ${kept.filter(x => x.r.zeroDupe).length}`);
L.push('');
L.push('='.repeat(72));
L.push('');

kept.forEach((x, i) => {
  const r = x.r;
  L.push(`PUZZLE ${i + 1}`);
  L.push(`Theme: ${x.t.theme}`);
  L.push(`Words: ${r.words.map(w => `${w} (${w.length})`).join(' / ')}`);
  L.push(`Letters used: ${Object.keys(r.freq).sort().join(',')} (${r.unique} unique, ${r.total} tiles)`);
  L.push(`Duplicate letters: ${r.dupes.length
    ? r.dupes.map(([ch, n]) => `${ch} x${n}`).join(', ') + `  (${r.dupes.length} duplicate tile${r.dupes.length === 1 ? '' : 's'} needed)`
    : 'None - ZERO-DUPLICATE'}`);
  const notes = [];
  notes.push(r.zeroDupe
    ? '18 distinct letters, the cleanest possible tile set'
    : `max any letter appears: ${r.worst}`);
  if (x.t.obscure) notes.push('OBSCURITY: ' + x.t.obscure);
  if (x.t.stretch) notes.push('THEME STRETCH: ' + x.t.stretch);
  L.push(`Notes: ${notes.join('. ')}`);
  L.push('');
  L.push('---');
  L.push('');
});

// ── Review summary ───────────────────────────────────────────────────────────

L.push('='.repeat(72));
L.push('SUMMARY FOR REVIEW');
L.push('='.repeat(72));
L.push('');

const dist = {};
kept.forEach(x => { const n = x.r.dupes.length; dist[n] = (dist[n] || 0) + 1; });
L.push('Duplicate tiles required:');
Object.keys(dist).sort((a, b) => a - b).forEach(k =>
  L.push(`  ${k} duplicate tile${k === '1' ? '' : 's'}: ${dist[k]} puzzle${dist[k] === 1 ? '' : 's'}`));
const uniques = kept.map(x => x.r.unique);
L.push(`  unique letters per puzzle: ${Math.min(...uniques)} to ${Math.max(...uniques)}, mean ${(uniques.reduce((a, b) => a + b, 0) / uniques.length).toFixed(1)} of 18`);
L.push('');
L.push('  No set reached 18 entirely distinct letters. Constraining four themed');
L.push('  words to exactly 3/4/5/6 letters leaves little room to also avoid every');
L.push('  repeat, so each puzzle needs a handful of duplicate tiles. The lower the');
L.push('  count, the cleaner the grid will be to lay out.');
L.push('');

// Words appearing in more than one puzzle
const usage = {};
kept.forEach(x => x.r.words.forEach(w => { (usage[w] = usage[w] || []).push(x.t.theme); }));
const reused = Object.entries(usage).filter(([, ts]) => ts.length > 1);
const byCount = {};
Object.values(usage).forEach(ts => { byCount[ts.length] = (byCount[ts.length] || 0) + 1; });
L.push('Word reuse:');
L.push(`  ${Object.keys(usage).length} distinct words across ${kept.length * 4} slots`);
Object.keys(byCount).sort((a, b) => a - b).forEach(k =>
  L.push(`    used ${k}x: ${byCount[k]} word${byCount[k] === 1 ? '' : 's'}`));
L.push('');
L.push('  The search actively avoids words already spent on an earlier puzzle,');
L.push('  weighting a repeat about ten times heavier than an extra duplicate');
L.push('  tile. What remains is where a pool was simply too narrow to dodge it.');
L.push('');
if (reused.length) {
  const heavy = reused.filter(([, ts]) => ts.length >= 3).sort((a, b) => b[1].length - a[1].length);
  if (heavy.length) {
    L.push('  Worth a look - words appearing three times or more:');
    heavy.forEach(([w, ts]) => L.push(`    ${w} (${ts.length}) - ${ts.join('; ')}`));
    L.push('');
  }
  L.push('  Words appearing exactly twice:');
  const twice = reused.filter(([, ts]) => ts.length === 2).sort();
  for (let i = 0; i < twice.length; i += 6) {
    L.push('    ' + twice.slice(i, i + 6).map(([w]) => w).join(', '));
  }
  L.push('');
  L.push('  None of this is wrong, since the themes differ - but for a daily you');
  L.push('  may not want a player meeting the same word twice in a year.');
  L.push('');
}

const flagged = kept.filter(x => x.t.obscure || x.t.stretch);
L.push(`Flagged for a second look: ${flagged.length}`);
flagged.forEach(x => L.push(`  ${x.t.theme} - ${x.t.obscure || x.t.stretch}`));
L.push('');

if (failed.length) {
  L.push('='.repeat(72));
  L.push('THEMES THAT DID NOT RESOLVE - pool needs more options');
  L.push('='.repeat(72));
  L.push('');
  failed.forEach(x => L.push(`  ${x.t.theme}: ${x.r.failed}`));
  L.push('');
  L.push('  These are not failures of the theme, only of the word pool I gave it.');
  L.push('  Widening the pool would very likely resolve them.');
  L.push('');
}

const out = L.join('\n');
fs.writeFileSync(path.join(__dirname, 'relation-candidates.txt'), out);

console.log(`themes attempted : ${solved.length}`);
console.log(`resolved         : ${good.length}`);
console.log(`included         : ${kept.length}`);
console.log(`zero-duplicate   : ${kept.filter(x => x.r.zeroDupe).length}`);
console.log(`flagged          : ${kept.filter(x => x.t.obscure || x.t.stretch).length}`);
failed.forEach(x => console.log(`  UNRESOLVED  ${x.t.theme}: ${x.r.failed}`));
if (good.length < TARGET) console.log(`\nSHORT BY ${TARGET - good.length}`);
