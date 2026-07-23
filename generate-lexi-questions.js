#!/usr/bin/env node
// generate-lexi-questions.js — run once to produce lexi-questions.json
// Usage: node generate-lexi-questions.js

const fs = require('fs');

const QUESTIONS = [
  // ── Levels 1–10: moderately obscure ─────────────────────────────────────────
  {
    level: 1,
    definition: "A person who uses flattery and excessive agreement to gain favor with those in power",
    correct: "sycophant",
    distractors: ["toady", "adulator", "fawner"]
  },
  {
    level: 2,
    definition: "Lasting for only a very short time; quickly fading or disappearing",
    correct: "ephemeral",
    distractors: ["fugacious", "transient", "evanescent"]
  },
  {
    level: 3,
    definition: "Guilty of deceit and betrayal; untrustworthy in a way that is likely to cause harm",
    correct: "perfidious",
    distractors: ["recreant", "treacherous", "duplicitous"]
  },
  {
    level: 4,
    definition: "Using very few words; brief and direct to the point of seeming rude",
    correct: "laconic",
    distractors: ["taciturn", "telegraphic", "brusque"]
  },
  {
    level: 5,
    definition: "Excessively eager to please or serve others; fawning and overly submissive",
    correct: "obsequious",
    distractors: ["sycophantic", "servile", "deferential"]
  },
  {
    level: 6,
    definition: "The quality of being open to more than one interpretation; deliberate vagueness or uncertainty in meaning",
    correct: "ambiguity",
    distractors: ["polysemy", "equivocation", "vagueness"]
  },
  {
    level: 7,
    definition: "A tendency to see the worst in everything; the belief that things will generally go badly",
    correct: "pessimism",
    distractors: ["cynicism", "nihilism", "defeatism"]
  },
  {
    level: 8,
    definition: "Showing a lack of respect for things considered sacred or serious; treating solemn things with contempt",
    correct: "irreverent",
    distractors: ["impious", "sacrilegious", "blasphemous"]
  },
  {
    level: 9,
    definition: "The tendency to believe things too readily; willingness to accept claims without sufficient evidence",
    correct: "credulity",
    distractors: ["ingenuousness", "naivety", "gullibility"]
  },
  {
    level: 10,
    definition: "Showing a calm lack of concern; relaxed and unconcerned to the point of seeming indifferent",
    correct: "nonchalant",
    distractors: ["insouciant", "sangfroid", "blasé"]
  },

  // ── Levels 11–25: less common ────────────────────────────────────────────────
  {
    level: 11,
    definition: "The interruption of a word by inserting another word or phrase in the middle of it — for example, 'abso-blooming-lutely'",
    correct: "tmesis",
    distractors: ["infixation", "intercalation", "interpolation"]
  },
  {
    level: 12,
    definition: "The strange wistfulness felt when visiting a used bookshop, sensing all the lives and worlds contained in books you'll never have time to read",
    correct: "vellichor",
    distractors: ["desiderium", "hiraeth", "saudade"]
  },
  {
    level: 13,
    definition: "The philosophical view that only one's own mind is certain to exist and that everything else — other people, the external world — may be an illusion",
    correct: "solipsism",
    distractors: ["solecism", "phenomenalism", "narcissism"]
  },
  {
    level: 14,
    definition: "Intended to ward off evil, bad luck, or harm; having a protective or magical function",
    correct: "apotropaic",
    distractors: ["propitiatory", "talismanic", "prophylactic"]
  },
  {
    level: 15,
    definition: "Reluctant to speak or reveal information; quiet and reserved in a way that suggests hidden feelings",
    correct: "reticent",
    distractors: ["taciturn", "diffident", "reserved"]
  },
  {
    level: 16,
    definition: "Promoting a particular point of view or cause in a way that distorts or ignores inconvenient facts; biased toward a predetermined conclusion",
    correct: "tendentious",
    distractors: ["partisan", "doctrinaire", "polemical"]
  },
  {
    level: 17,
    definition: "The linguistic property of a single word having several different but related meanings — for example, 'bank' meaning both a financial institution and the side of a river",
    correct: "polysemy",
    distractors: ["ambiguity", "amphibology", "homonymy"]
  },
  {
    level: 18,
    definition: "Producing a great abundance of work, ideas, or offspring; extremely fertile and creative",
    correct: "prolific",
    distractors: ["prodigious", "fructiferous", "fecund"]
  },
  {
    level: 19,
    definition: "In a state of decline and approaching death; no longer effective or vigorous",
    correct: "moribund",
    distractors: ["effete", "terminal", "sepulchral"]
  },
  {
    level: 20,
    definition: "A form of logical reasoning in which a conclusion is drawn from two premises — for example, 'All humans are mortal; Socrates is human; therefore Socrates is mortal'",
    correct: "syllogism",
    distractors: ["aphorism", "sorites", "enthymeme"]
  },
  {
    level: 21,
    definition: "The tendency to view everything from one's own perspective and to treat oneself as the center of the world",
    correct: "egocentrism",
    distractors: ["narcissism", "individualism", "solipsism"]
  },
  {
    level: 22,
    definition: "Expressing or conveying a warning; intended to caution against bad behavior or poor choices",
    correct: "admonitory",
    distractors: ["hortatory", "cautionary", "exemplary"]
  },
  {
    level: 23,
    definition: "The habit or practice of using very long words; a fondness for obscure, lengthy vocabulary",
    correct: "sesquipedalianism",
    distractors: ["verbosity", "magniloquence", "grandiloquence"]
  },
  {
    level: 24,
    definition: "A figure of speech in which the second part of an expression mirrors the first in reversed order — for example, 'Never let a fool kiss you or a kiss fool you'",
    correct: "chiasmus",
    distractors: ["antithesis", "anastrophe", "parallelism"]
  },
  {
    level: 25,
    definition: "Tending to fade or vanish like vapor; delicate and short-lived in a ghostly or ethereal way",
    correct: "evanescent",
    distractors: ["tenuous", "ephemeral", "fugacious"]
  },

  // ── Levels 26–50: genuinely rare ─────────────────────────────────────────────
  {
    level: 26,
    definition: "The tendency to perceive meaningful connections, patterns, or relationships in unrelated or random things — finding significance where none objectively exists",
    correct: "apophenia",
    distractors: ["pareidolia", "synchronicity", "confabulation"]
  },
  {
    level: 27,
    definition: "A soft, murmuring sound like wind moving gently through leaves or trees",
    correct: "susurrus",
    distractors: ["sibilance", "sough", "sibilation"]
  },
  {
    level: 28,
    definition: "A figure of speech in which the speaker breaks off in the middle of a sentence — as if overcome by emotion or suddenly unwilling to continue — leaving the thought unfinished",
    correct: "aposiopesis",
    distractors: ["anacoluthon", "epanorthosis", "ellipsis"]
  },
  {
    level: 29,
    definition: "The deliberate rearrangement of the normal order of words in a sentence for rhetorical or poetic effect — the manner in which Yoda famously speaks",
    correct: "hyperbaton",
    distractors: ["anastrophe", "synchysis", "inversion"]
  },
  {
    level: 30,
    definition: "A word that imitates the sound it describes — for example, 'buzz,' 'crash,' or 'murmur'",
    correct: "onomatopoeia",
    distractors: ["echoism", "alliteration", "assonance"]
  },
  {
    level: 31,
    definition: "The use of a mild or indirect word or phrase in place of something blunt or potentially offensive",
    correct: "euphemism",
    distractors: ["periphrasis", "circumlocution", "litotes"]
  },
  {
    level: 32,
    definition: "Deep-seated, long-lasting bitterness and ill will; bitter hatred that refuses to fade",
    correct: "rancor",
    distractors: ["resentment", "animus", "acrimony"]
  },
  {
    level: 33,
    definition: "A figure of speech that exploits similarities between words — a pun; the rhetorical use of multiple meanings or of words that sound alike for witty effect",
    correct: "paronomasia",
    distractors: ["antanaclasis", "syllepsis", "equivocation"]
  },
  {
    level: 34,
    definition: "A profound state of listlessness, spiritual apathy, and inability to feel; in medieval theology, the sin of sloth understood as indifference to the divine rather than mere laziness",
    correct: "acedia",
    distractors: ["ennui", "hebetude", "anomie"]
  },
  {
    level: 35,
    definition: "Bitter, aggressive verbal criticism; a torrent of harshly abusive language directed at someone",
    correct: "vituperation",
    distractors: ["diatribe", "philippic", "invective"]
  },
  {
    level: 36,
    definition: "A brief, pointed, instructive saying attributed to a notable person; a memorable remark that captures a truth in very few words",
    correct: "apophthegm",
    distractors: ["aphorism", "gnome", "epigram"]
  },
  {
    level: 37,
    definition: "A figure of speech in which a part stands for the whole, or the whole for a part — for example, 'all hands on deck' using 'hands' to mean people",
    correct: "synecdoche",
    distractors: ["meronymy", "metonymy", "antonomasia"]
  },
  {
    level: 38,
    definition: "The practical application of knowledge or theory; the doing of something as opposed to just theorizing about it",
    correct: "praxis",
    distractors: ["pragmatics", "techne", "heuristics"]
  },
  {
    level: 39,
    definition: "The formal withdrawal of a previous statement or belief; a public declaration that one was wrong and now rejects what was said",
    correct: "recantation",
    distractors: ["abjuration", "contrition", "palinode"]
  },
  {
    level: 40,
    definition: "The belief that all events, including human choices, are inevitably caused by prior events and the laws of nature — leaving no room for genuine free will",
    correct: "determinism",
    distractors: ["fatalism", "compatibilism", "predestination"]
  },
  {
    level: 41,
    definition: "A phrase or statement that can be understood in two ways, one of which is typically risqué or indecent",
    correct: "double entendre",
    distractors: ["innuendo", "equivoque", "ambiguity"]
  },
  {
    level: 42,
    definition: "Fond of jokes and playful humor; humorous and mischievous in a light-hearted way",
    correct: "waggish",
    distractors: ["facetious", "droll", "jocular"]
  },
  {
    level: 43,
    definition: "Making a hypocritical show of being morally superior or pious; self-righteously judgmental of others",
    correct: "sanctimonious",
    distractors: ["pietistic", "unctuous", "pharisaical"]
  },
  {
    level: 44,
    definition: "The internal world of a story — the narrative universe in which the characters exist and events take place, as distinct from how that story is told to an audience",
    correct: "diegesis",
    distractors: ["mimesis", "fabula", "ekphrasis"]
  },
  {
    level: 45,
    definition: "Of ominous significance; seeming to warn of disaster — or, in a secondary sense, pompously self-important",
    correct: "portentous",
    distractors: ["pompous", "inauspicious", "ponderous"]
  },
  {
    level: 46,
    definition: "Vague and unclear; lacking definite form or limits; hazy in meaning",
    correct: "nebulous",
    distractors: ["tenebrous", "amorphous", "ethereal"]
  },
  {
    level: 47,
    definition: "The habit of judging other cultures and peoples by the standards of one's own culture, assuming one's own is superior",
    correct: "ethnocentrism",
    distractors: ["xenophobia", "chauvinism", "parochialism"]
  },
  {
    level: 48,
    definition: "A form of discourse whose purpose is to offer moral guidance and earnest counsel; writing or speech that exhorts the reader toward virtuous behavior",
    correct: "parenesis",
    distractors: ["homily", "protreptic", "catechesis"]
  },
  {
    level: 49,
    definition: "The study of signs and symbols and how they produce meaning; the analysis of how language, images, and objects communicate",
    correct: "semiotics",
    distractors: ["significs", "structuralism", "hermeneutics"]
  },
  {
    level: 50,
    definition: "The tendency to explain complex phenomena by reducing them to a single simple cause or principle",
    correct: "reductionism",
    distractors: ["determinism", "parsimony", "oversimplification"]
  },

  // ── Levels 51–75: highly obscure, specialist, archaic ────────────────────────
  {
    level: 51,
    definition: "The branch of philosophy concerned with the nature, sources, and limits of knowledge — asking how we know what we know",
    correct: "epistemology",
    distractors: ["ontology", "agnoiology", "phenomenology"]
  },
  {
    level: 52,
    definition: "A figure of speech in which a single verb or other word governs two or more nouns in different senses — for example, 'She broke his car and his heart'",
    correct: "zeugma",
    distractors: ["syllepsis", "diazeugma", "hendiadys"]
  },
  {
    level: 53,
    definition: "The use of a word in a context that strains or breaks its conventional meaning — either deliberately for effect or by mistake; extending a word far beyond its normal sense (e.g. 'the foot of a mountain,' 'the eye of a needle')",
    correct: "catachresis",
    distractors: ["solecism", "acyrologia", "malapropism"]
  },
  {
    level: 54,
    definition: "The principle by which a letter takes its name from a word beginning with the sound that letter represents — the system underlying why the ancient letter 'aleph' (meaning 'ox') came to stand for the sound /a/",
    correct: "acrophony",
    distractors: ["acrophobia", "phonography", "logography"]
  },
  {
    level: 55,
    definition: "A polite or agreeable response that is subtly mocking or cutting; a refined form of sarcasm delivered under a veneer of courtesy",
    correct: "asteism",
    distractors: ["irony", "charientismus", "sarcasm"]
  },
  {
    level: 56,
    definition: "A figure of speech in which an affirmative is expressed through the negation of its opposite — for example, 'not bad' meaning 'good,' or 'no small feat' meaning 'a great achievement'",
    correct: "litotes",
    distractors: ["diminution", "meiosis", "understatement"]
  },
  {
    level: 57,
    definition: "The literary technique of attributing human emotions or feelings to natural forces or inanimate objects — for example, describing a storm as 'angry' or leaves as 'weeping' to reflect a character's mood",
    correct: "pathetic fallacy",
    distractors: ["anthropomorphism", "animism", "prosopopoeia"]
  },
  {
    level: 58,
    definition: "An argument or piece of reasoning that appears valid but contains a logical flaw; a false inference that violates the rules of logic",
    correct: "paralogism",
    distractors: ["syllogism", "enthymeme", "sophism"]
  },
  {
    level: 59,
    definition: "The use of more words than necessary to express an idea, where the extra words add no meaning — for example, 'free gift' or 'past history'",
    correct: "pleonasm",
    distractors: ["tautology", "battology", "verbosity"]
  },
  {
    level: 60,
    definition: "A figure of speech in which a speaker directly addresses an absent or imaginary person, a deceased person, or an abstract quality as though present — for example, 'O Death, where is thy sting?'",
    correct: "apostrophe",
    distractors: ["invocation", "allocution", "prosopopoeia"]
  },
  {
    level: 61,
    definition: "A rhetorical device in which the same word or phrase is repeated at the beginning of successive clauses or sentences — used to build emphasis and rhythm",
    correct: "anaphora",
    distractors: ["epistrophe", "anadiplosis", "epanalepsis"]
  },
  {
    level: 62,
    definition: "The rhetorical substitution of one part of speech for another — most commonly, using a noun as a verb, as in 'to Google something' or 'to gift someone a book'",
    correct: "antimeria",
    distractors: ["enallage", "metaplasm", "syllepsis"]
  },
  {
    level: 63,
    definition: "The omission of connecting words such as 'and' or 'but' between a series of clauses, creating a rapid, list-like style — for example, 'I came, I saw, I conquered'",
    correct: "asyndeton",
    distractors: ["polysyndeton", "syndesis", "parataxis"]
  },
  {
    level: 64,
    definition: "A rhetorical device in which clauses or ideas are arranged in ascending order of importance or intensity, each one building on the last to reach a powerful climax",
    correct: "auxesis",
    distractors: ["climax", "anabasis", "amplification"]
  },
  {
    level: 65,
    definition: "A line drawn on a linguistic map that marks the geographic boundary between areas where different words, pronunciations, or grammatical features are used",
    correct: "isogloss",
    distractors: ["dialect boundary", "isopleth", "isophone"]
  },
  {
    level: 66,
    definition: "The placement of a word or phrase next to another to explain or rename it — for example, 'my friend, the doctor' or 'the city of Rome'",
    correct: "apposition",
    distractors: ["epexegesis", "juxtaposition", "predication"]
  },
  {
    level: 67,
    definition: "The use of a word or phrase to mean its opposite, typically for ironic or sarcastic effect — for example, calling a very large man 'Tiny'",
    correct: "antiphrasis",
    distractors: ["enantiosis", "irony", "sarcasm"]
  },
  {
    level: 68,
    definition: "A figure of speech in which one thing is referred to by the name of something closely associated with it — for example, 'the crown' for the monarchy, or 'the bottle' for alcohol",
    correct: "metonymy",
    distractors: ["synecdoche", "metalepsis", "meronymy"]
  },
  {
    level: 69,
    definition: "The deliberate omission of words from a sentence whose meaning can be inferred from context; a trailing off that allows the reader or listener to fill in the gap",
    correct: "ellipsis",
    distractors: ["aposiopesis", "asyndeton", "apocope"]
  },
  {
    level: 70,
    definition: "The logical fallacy of appealing to the authority of an expert as sufficient proof of a claim — assuming something must be true because someone important said so",
    correct: "argumentum ad verecundiam",
    distractors: ["ad hominem", "argumentum ad populum", "ipse dixit"]
  },
  {
    level: 71,
    definition: "The deliberate repetition of conjunctions such as 'and' or 'but' between each item in a list, slowing the pace of a sentence and creating a sense of accumulation",
    correct: "polysyndeton",
    distractors: ["asyndeton", "parataxis", "zeugma"]
  },
  {
    level: 72,
    definition: "A word derived from the name of a real or legendary person — for example, 'boycott' from Charles Boycott, or 'sandwich' from the Earl of Sandwich",
    correct: "eponym",
    distractors: ["toponym", "toponymy", "anthroponym"]
  },
  {
    level: 73,
    definition: "A rhetorical device in which the same word or phrase is repeated at the end of successive clauses or sentences — the mirror image of anaphora",
    correct: "epistrophe",
    distractors: ["anaphora", "symploce", "epanalepsis"]
  },
  {
    level: 74,
    definition: "The linguistic property of a single word having two meanings that are directly opposite to each other — for example, 'sanction' (which can mean both to authorize and to penalize) or 'cleave' (both to split apart and to cling to)",
    correct: "enantiosemy",
    distractors: ["polysemy", "antonymy", "heterosemy"]
  },
  {
    level: 75,
    definition: "The ancient practice of predicting the future by examining the internal organs — especially the liver — of sacrificed animals",
    correct: "haruspicy",
    distractors: ["augury", "haruspex", "extispicy"]
  },

  // ── Levels 76–100: near-impossible ───────────────────────────────────────────
  {
    level: 76,
    definition: "The act of assigning a date to something that is earlier than its actual date of origin; placing a document or event falsely in the past",
    correct: "antedating",
    distractors: ["predating", "prochronism", "anachronism"]
  },
  {
    level: 77,
    definition: "A figure of speech in which the speaker expresses genuine or feigned uncertainty and doubt, inviting the audience to consider a difficult question alongside them",
    correct: "aporia",
    distractors: ["dubitatio", "diaporesis", "perplexity"]
  },
  {
    level: 78,
    definition: "The view that moral standards are culturally specific and that no culture's moral code is objectively superior to any other's",
    correct: "moral relativism",
    distractors: ["nihilism", "moral skepticism", "ethical subjectivism"]
  },
  {
    level: 79,
    definition: "The dropping of one or more sounds from the beginning of a word — for example, 'twixt' from 'betwixt,' or 'bout' from 'about'",
    correct: "aphaeresis",
    distractors: ["apocope", "prothesis", "syncope"]
  },
  {
    level: 80,
    definition: "A contradiction between two laws, principles, or propositions that seem equally valid — an irresolvable logical conflict",
    correct: "antinomy",
    distractors: ["paradox", "aporia", "antimony"]
  },
  {
    level: 81,
    definition: "A rhetorical technique in which the speaker pretends to refuse or pass over something while actually drawing full attention to it — for example, 'I won't mention his drinking problem'",
    correct: "apophasis",
    distractors: ["apophysis", "procatalepsis", "prolepsis"]
  },
  {
    level: 82,
    definition: "The philosophical study of the nature of moral claims themselves — asking not 'what is right?' but 'what does it even mean for something to be right?'",
    correct: "metaethics",
    distractors: ["deontology", "cognitivism", "axiology"]
  },
  {
    level: 83,
    definition: "A figure of speech in which an adjective or modifier is transferred from the noun it logically belongs with to another noun in the same sentence — for example, 'the plowman plods his weary way home,' where it is the plowman, not the way, who is weary",
    correct: "hypallage",
    distractors: ["enallage", "synchysis", "hyperbaton"]
  },
  {
    level: 84,
    definition: "An abrupt descent from the elevated to the trivial or ridiculous within a piece of writing — the effect of suddenly dropping from a grand tone to something anticlimactic or absurd",
    correct: "bathos",
    distractors: ["anticlimax", "pathos", "meiosis"]
  },
  {
    level: 85,
    definition: "A word or expression that occurs only once in a body of literature, in an author's entire surviving works, or across the recorded instances of a language — making its meaning sometimes impossible to determine with certainty",
    correct: "hapax legomenon",
    distractors: ["nonce word", "ghostword", "dis legomenon"]
  },
  {
    level: 86,
    definition: "The dropping of a sound or syllable from the end of a word — for example, 'singin'' for 'singing,' or 'ol'' for 'old'",
    correct: "apocope",
    distractors: ["syncope", "paragoge", "aphaeresis"]
  },
  {
    level: 87,
    definition: "A rhetorical question asked purely for effect, with no answer expected — used to emphasize a point or stir the listener's emotions",
    correct: "erotema",
    distractors: ["eroteme", "hypophora", "anacoenosis"]
  },
  {
    level: 88,
    definition: "The substitution of a harsh, offensive, or blunt expression for a neutral or positive one — making something sound worse than it is; the deliberate opposite of euphemism",
    correct: "dysphemism",
    distractors: ["euphemism", "imprecation", "malediction"]
  },
  {
    level: 89,
    definition: "The substitution of one grammatical form for another to achieve a specific rhetorical effect — for example, using the present tense to describe a past event, making it feel immediate",
    correct: "enallage",
    distractors: ["syllepsis", "anthimeria", "hypallage"]
  },
  {
    level: 90,
    definition: "Divination by observing the behavior, flight patterns, and sounds of birds",
    correct: "ornithomancy",
    distractors: ["augury", "auspication", "alectromancy"]
  },
  {
    level: 91,
    definition: "A figure of speech in which two words connected by a conjunction express a single complex idea that would normally be expressed as a noun modified by an adjective — for example, 'sound and fury' for 'furious sound'",
    correct: "hendiadys",
    distractors: ["zeugma", "merism", "syllepsis"]
  },
  {
    level: 92,
    definition: "The philosophical view that abstract entities such as numbers, universals, or ideal forms exist independently of and prior to the human mind",
    correct: "Platonism",
    distractors: ["idealism", "essentialism", "rationalism"]
  },
  {
    level: 93,
    definition: "In logic, a form of reasoning that infers the most likely explanation from a set of observations — reasoning from evidence to the simplest hypothesis that would explain it",
    correct: "abduction",
    distractors: ["induction", "adduction", "epagoge"]
  },
  {
    level: 94,
    definition: "The use of a descriptive phrase, title, or epithet in place of a proper name — or conversely, the use of a proper name to stand for a general type (e.g. 'a Scrooge' to mean a miser)",
    correct: "antonomasia",
    distractors: ["eponym", "periphrasis", "synecdoche"]
  },
  {
    level: 95,
    definition: "The use of a longer phrase to refer to something that could be stated simply — a roundabout way of naming something, often to add dignity or avoid repetition",
    correct: "periphrasis",
    distractors: ["circumlocution", "perissology", "antonomasia"]
  },
  {
    level: 96,
    definition: "A rhetorical figure in which the same words are repeated in reverse order in successive clauses — for example, 'Ask not what your country can do for you; ask what you can do for your country'",
    correct: "antimetabole",
    distractors: ["chiasmus", "anadiplosis", "epanalepsis"]
  },
  {
    level: 97,
    definition: "The rhetorical technique of giving a voice, personality, or human form to an absent person, a deceased individual, or an abstract concept — making something speak that cannot speak",
    correct: "prosopopoeia",
    distractors: ["personification", "ethopoeia", "enargeia"]
  },
  {
    level: 98,
    definition: "The study of rhythm, stress, and intonation in poetry; the analysis of metrical patterns in verse",
    correct: "prosody",
    distractors: ["metrics", "versification", "scansion"]
  },
  {
    level: 99,
    definition: "An irresistible urge to do something one knows to be inadvisable; a compulsion or bad habit one cannot seem to resist — famously invoked in the phrase 'cacoethes scribendi,' meaning an uncontrollable itch to write",
    correct: "cacoethes",
    distractors: ["compulsion", "monomania", "kleptomania"]
  },
  {
    level: 100,
    definition: "The ancient art of predicting the future from the sounds, direction, and intensity of thunder",
    correct: "brontomancy",
    distractors: ["keraunomancy", "ombromancy", "astrapomancy"]
  }
];

// ── Validation ────────────────────────────────────────────────────────────────
let issues = [];

const correctWords = QUESTIONS.map(q => q.correct.toLowerCase());
const seen = new Set();
correctWords.forEach((w, i) => {
  if (seen.has(w)) issues.push(`Level ${QUESTIONS[i].level}: duplicate correct word "${w}"`);
  seen.add(w);
});

QUESTIONS.forEach(q => {
  if (q.distractors.length !== 3) issues.push(`Level ${q.level}: must have exactly 3 distractors`);
  q.distractors.forEach(d => {
    if (d.toLowerCase() === q.correct.toLowerCase())
      issues.push(`Level ${q.level}: distractor "${d}" matches correct word`);
  });
});

if (issues.length) {
  console.error('Warning: Validation issues:');
  issues.forEach(i => console.error('  *', i));
  process.exit(1);
} else {
  console.log('All 100 questions validated.');
}

// Strip distractorTypes if accidentally present, write clean output
const output = QUESTIONS.map(({ level, definition, correct, distractors }) =>
  ({ level, definition, correct, distractors })
);

fs.writeFileSync('assets/data/lexi-questions.json', JSON.stringify(output, null, 2));
console.log(`Written to assets/data/lexi-questions.json (${output.length} questions)`);
