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
    distractors: ["toady", "sycophent", "fawner"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 2,
    definition: "Lasting for only a very short time; quickly fading or disappearing",
    correct: "ephemeral",
    distractors: ["ephemoral", "transient", "evanescent"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 3,
    definition: "Guilty of deceit and betrayal; untrustworthy in a way that is likely to cause harm",
    correct: "perfidious",
    distractors: ["perfideous", "treacherous", "duplicitous"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 4,
    definition: "Using very few words; brief and direct to the point of seeming rude",
    correct: "laconic",
    distractors: ["taciturn", "laconick", "brusque"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 5,
    definition: "Excessively eager to please or serve others; fawning and overly submissive",
    correct: "obsequious",
    distractors: ["obsequous", "servile", "deferential"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 6,
    definition: "The quality of being open to more than one interpretation; deliberate vagueness or uncertainty in meaning",
    correct: "ambiguity",
    distractors: ["ambiguety", "equivocation", "vagueness"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 7,
    definition: "A tendency to see the worst in everything; the belief that things will generally go badly",
    correct: "pessimism",
    distractors: ["cynicism", "nihilism", "pessimizm"],
    distractorTypes: ["real", "real", "misspelling"]
  },
  {
    level: 8,
    definition: "Showing a lack of respect for things considered sacred or serious; treating solemn things with contempt",
    correct: "irreverent",
    distractors: ["impious", "ireverent", "blasphemous"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 9,
    definition: "The tendency to believe things too readily; willingness to accept claims without sufficient evidence",
    correct: "credulity",
    distractors: ["credulty", "naivety", "gullibility"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 10,
    definition: "Showing a calm lack of concern; relaxed and unconcerned to the point of seeming indifferent",
    correct: "nonchalant",
    distractors: ["insouciant", "nonchalent", "blasé"],
    distractorTypes: ["real", "misspelling", "real"]
  },

  // ── Levels 11–25: less common ────────────────────────────────────────────────
  {
    level: 11,
    definition: "The interruption of a word by inserting another word or phrase in the middle of it — for example, 'abso-blooming-lutely'",
    correct: "tmesis",
    distractors: ["infixation", "thmesis", "interpolation"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 12,
    definition: "The strange wistfulness felt when visiting a used bookshop, sensing all the lives and worlds contained in books you'll never have time to read",
    correct: "vellichor",
    distractors: ["velicor", "hiraeth", "saudade"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 13,
    definition: "The philosophical view that only one's own mind is certain to exist and that everything else — other people, the external world — may be an illusion",
    correct: "solipsism",
    distractors: ["solecism", "solipsizm", "narcissism"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 14,
    definition: "Intended to ward off evil, bad luck, or harm; having a protective or magical function",
    correct: "apotropaic",
    distractors: ["apotropaick", "talismanic", "prophylactic"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 15,
    definition: "Reluctant to speak or reveal information; quiet and reserved in a way that suggests hidden feelings",
    correct: "reticent",
    distractors: ["taciturn", "reticant", "reserved"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 16,
    definition: "Promoting a particular point of view or cause in a way that distorts or ignores inconvenient facts; biased toward a predetermined conclusion",
    correct: "tendentious",
    distractors: ["partisan", "tendencious", "polemical"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 17,
    definition: "The linguistic property of a single word having several different but related meanings — for example, 'bank' meaning both a financial institution and the side of a river",
    correct: "polysemy",
    distractors: ["ambiguity", "polysemie", "homonymy"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 18,
    definition: "Producing a great abundance of work, ideas, or offspring; extremely fertile and creative",
    correct: "prolific",
    distractors: ["prodigious", "prolifick", "fecund"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 19,
    definition: "In a state of decline and approaching death; no longer effective or vigorous",
    correct: "moribund",
    distractors: ["morabund", "terminal", "sepulchral"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 20,
    definition: "A form of logical reasoning in which a conclusion is drawn from two premises — for example, 'All humans are mortal; Socrates is human; therefore Socrates is mortal'",
    correct: "syllogism",
    distractors: ["aphorism", "syllogizm", "enthymeme"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 21,
    definition: "The tendency to view everything from one's own perspective and to treat oneself as the center of the world",
    correct: "egocentrism",
    distractors: ["narcissism", "egocentrizm", "solipsism"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 22,
    definition: "Expressing or conveying a warning; intended to caution against bad behavior or poor choices",
    correct: "admonitory",
    distractors: ["admonetary", "cautionary", "exemplary"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 23,
    definition: "The habit or practice of using very long words; a fondness for obscure, lengthy vocabulary",
    correct: "sesquipedalianism",
    distractors: ["verbosity", "sesquipedalizm", "grandiloquence"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 24,
    definition: "A figure of speech in which the second part of an expression mirrors the first in reversed order — for example, 'Never let a fool kiss you or a kiss fool you'",
    correct: "chiasmus",
    distractors: ["antithesis", "chiazmus", "parallelism"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 25,
    definition: "Tending to fade or vanish like vapor; delicate and short-lived in a ghostly or ethereal way",
    correct: "evanescent",
    distractors: ["evanescant", "ephemeral", "fugacious"],
    distractorTypes: ["misspelling", "real", "real"]
  },

  // ── Levels 26–50: genuinely rare ─────────────────────────────────────────────
  {
    level: 26,
    definition: "The tendency to perceive meaningful connections, patterns, or relationships in unrelated or random things — finding significance where none objectively exists",
    correct: "apophenia",
    distractors: ["pareidolia", "apophenea", "confabulation"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 27,
    definition: "A soft, murmuring sound like wind moving gently through leaves or trees",
    correct: "susurrus",
    distractors: ["sibilance", "susurus", "sibilation"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 28,
    definition: "A figure of speech in which the speaker breaks off in the middle of a sentence — as if overcome by emotion or suddenly unwilling to continue — leaving the thought unfinished",
    correct: "aposiopesis",
    distractors: ["anacoluthon", "aposiopisis", "ellipsis"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 29,
    definition: "The deliberate rearrangement of the normal order of words in a sentence for rhetorical or poetic effect — the manner in which Yoda famously speaks",
    correct: "hyperbaton",
    distractors: ["anastrophe", "hyperbatan", "inversion"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 30,
    definition: "A word that imitates the sound it describes — for example, 'buzz,' 'crash,' or 'murmur'",
    correct: "onomatopoeia",
    distractors: ["onomatopeia", "alliteration", "assonance"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 31,
    definition: "The use of a mild or indirect word or phrase in place of something blunt or potentially offensive",
    correct: "euphemism",
    distractors: ["euphemizm", "circumlocution", "litotes"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 32,
    definition: "Deep-seated, long-lasting bitterness and ill will; bitter hatred that refuses to fade",
    correct: "rancor",
    distractors: ["resentment", "renkor", "acrimony"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 33,
    definition: "A figure of speech that exploits similarities between words — a pun; the rhetorical use of multiple meanings or of words that sound alike for witty effect",
    correct: "paronomasia",
    distractors: ["antanaclasis", "paranomasia", "equivocation"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 34,
    definition: "A profound state of listlessness, spiritual apathy, and inability to feel; in medieval theology, the sin of sloth understood as indifference to the divine rather than mere laziness",
    correct: "acedia",
    distractors: ["ennui", "acedie", "anomie"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 35,
    definition: "Bitter, aggressive verbal criticism; a torrent of harshly abusive language directed at someone",
    correct: "vituperation",
    distractors: ["diatribe", "vitupration", "invective"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 36,
    definition: "A brief, pointed, instructive saying attributed to a notable person; a memorable remark that captures a truth in very few words",
    correct: "apophthegm",
    distractors: ["aphorism", "apophthegem", "epigram"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 37,
    definition: "A figure of speech in which a part stands for the whole, or the whole for a part — for example, 'all hands on deck' using 'hands' to mean people",
    correct: "synecdoche",
    distractors: ["synecdochy", "metonymy", "antonomasia"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 38,
    definition: "The practical application of knowledge or theory; the doing of something as opposed to just theorizing about it",
    correct: "praxis",
    distractors: ["pragmatics", "praxsis", "heuristics"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 39,
    definition: "The formal withdrawal of a previous statement or belief; a public declaration that one was wrong and now rejects what was said",
    correct: "recantation",
    distractors: ["recantasion", "contrition", "palinode"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 40,
    definition: "The belief that all events, including human choices, are inevitably caused by prior events and the laws of nature — leaving no room for genuine free will",
    correct: "determinism",
    distractors: ["fatalism", "determinizm", "predestination"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 41,
    definition: "A phrase or statement that can be understood in two ways, one of which is typically risqué or indecent",
    correct: "double entendre",
    distractors: ["innuendo", "double entandre", "ambiguity"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 42,
    definition: "Fond of jokes and playful humor; humorous and mischievous in a light-hearted way",
    correct: "waggish",
    distractors: ["facetious", "waggisch", "jocular"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 43,
    definition: "Making a hypocritical show of being morally superior or pious; self-righteously judgmental of others",
    correct: "sanctimonious",
    distractors: ["sanctimoneous", "unctuous", "pharisaical"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 44,
    definition: "The internal world of a story — the narrative universe in which the characters exist and events take place, as distinct from how that story is told to an audience",
    correct: "diegesis",
    distractors: ["mimesis", "diegessis", "ekphrasis"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 45,
    definition: "Of ominous significance; seeming to warn of disaster — or, in a secondary sense, pompously self-important",
    correct: "portentous",
    distractors: ["pompous", "portentious", "ponderous"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 46,
    definition: "Vague and unclear; lacking definite form or limits; hazy in meaning",
    correct: "nebulous",
    distractors: ["nebulos", "amorphous", "ethereal"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 47,
    definition: "The habit of judging other cultures and peoples by the standards of one's own culture, assuming one's own is superior",
    correct: "ethnocentrism",
    distractors: ["xenophobia", "ethnocentrizm", "parochialism"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 48,
    definition: "A form of discourse whose purpose is to offer moral guidance and earnest counsel; writing or speech that exhorts the reader toward virtuous behavior",
    correct: "parenesis",
    distractors: ["homily", "parenisis", "catechesis"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 49,
    definition: "The study of signs and symbols and how they produce meaning; the analysis of how language, images, and objects communicate",
    correct: "semiotics",
    distractors: ["semeiology", "semioticks", "hermeneutics"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 50,
    definition: "The tendency to explain complex phenomena by reducing them to a single simple cause or principle",
    correct: "reductionism",
    distractors: ["determinism", "reductionizm", "oversimplification"],
    distractorTypes: ["real", "misspelling", "real"]
  },

  // ── Levels 51–75: highly obscure, specialist, archaic ────────────────────────
  {
    level: 51,
    definition: "The branch of philosophy concerned with the nature, sources, and limits of knowledge — asking how we know what we know",
    correct: "epistemology",
    distractors: ["ontology", "epistemolgy", "phenomenology"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 52,
    definition: "A figure of speech in which a single verb or other word governs two or more nouns in different senses — for example, 'She broke his car and his heart'",
    correct: "zeugma",
    distractors: ["syllepsis", "zeugmah", "hendiadys"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 53,
    definition: "The use of a word in a context that strains or breaks its conventional meaning — either deliberately for effect or by mistake; extending a word far beyond its normal sense (e.g. 'the foot of a mountain,' 'the eye of a needle')",
    correct: "catachresis",
    distractors: ["solecism", "catachrisis", "malapropism"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 54,
    definition: "The principle by which a letter takes its name from a word beginning with the sound that letter represents — the system underlying why the ancient letter 'aleph' (meaning 'ox') came to stand for the sound /a/",
    correct: "acrophony",
    distractors: ["acrophobia", "acrophonie", "logography"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 55,
    definition: "A polite or agreeable response that is subtly mocking or cutting; a refined form of sarcasm delivered under a veneer of courtesy",
    correct: "asteism",
    distractors: ["irony", "asteizm", "sarcasm"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 56,
    definition: "A figure of speech in which an affirmative is expressed through the negation of its opposite — for example, 'not bad' meaning 'good,' or 'no small feat' meaning 'a great achievement'",
    correct: "litotes",
    distractors: ["litotees", "meiosis", "understatement"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 57,
    definition: "The literary technique of attributing human emotions or feelings to natural forces or inanimate objects — for example, describing a storm as 'angry' or leaves as 'weeping' to reflect a character's mood",
    correct: "pathetic fallacy",
    distractors: ["anthropomorphism", "pathetic falacy", "prosopopoeia"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 58,
    definition: "An argument or piece of reasoning that appears valid but contains a logical flaw; a false inference that violates the rules of logic",
    correct: "paralogism",
    distractors: ["syllogism", "paralogizm", "sophism"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 59,
    definition: "The use of more words than necessary to express an idea, where the extra words add no meaning — for example, 'free gift' or 'past history'",
    correct: "pleonasm",
    distractors: ["tautology", "plenonasm", "verbosity"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 60,
    definition: "A figure of speech in which a speaker directly addresses an absent or imaginary person, a deceased person, or an abstract quality as though present — for example, 'O Death, where is thy sting?'",
    correct: "apostrophe",
    distractors: ["invocation", "apostrofe", "prosopopoeia"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 61,
    definition: "A rhetorical device in which the same word or phrase is repeated at the beginning of successive clauses or sentences — used to build emphasis and rhythm",
    correct: "anaphora",
    distractors: ["epistrophe", "anapora", "epanalepsis"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 62,
    definition: "The rhetorical substitution of one part of speech for another — most commonly, using a noun as a verb, as in 'to Google something' or 'to gift someone a book'",
    correct: "antimeria",
    distractors: ["enallage", "antinomia", "syllepsis"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 63,
    definition: "The omission of connecting words such as 'and' or 'but' between a series of clauses, creating a rapid, list-like style — for example, 'I came, I saw, I conquered'",
    correct: "asyndeton",
    distractors: ["polysyndeton", "asyndetton", "parataxis"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 64,
    definition: "A rhetorical device in which clauses or ideas are arranged in ascending order of importance or intensity, each one building on the last to reach a powerful climax",
    correct: "auxesis",
    distractors: ["climax", "auxisis", "amplification"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 65,
    definition: "A line drawn on a linguistic map that marks the geographic boundary between areas where different words, pronunciations, or grammatical features are used",
    correct: "isogloss",
    distractors: ["dialect boundary", "isoglosse", "isophone"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 66,
    definition: "The placement of a word or phrase next to another to explain or rename it — for example, 'my friend, the doctor' or 'the city of Rome'",
    correct: "apposition",
    distractors: ["appositon", "juxtaposition", "predication"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 67,
    definition: "The use of a word or phrase to mean its opposite, typically for ironic or sarcastic effect — for example, calling a very large man 'Tiny'",
    correct: "antiphrasis",
    distractors: ["antiphasis", "irony", "sarcasm"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 68,
    definition: "A figure of speech in which one thing is referred to by the name of something closely associated with it — for example, 'the crown' for the monarchy, or 'the bottle' for alcohol",
    correct: "metonymy",
    distractors: ["synecdoche", "metonimy", "meronymy"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 69,
    definition: "The deliberate omission of words from a sentence whose meaning can be inferred from context; a trailing off that allows the reader or listener to fill in the gap",
    correct: "ellipsis",
    distractors: ["elipsis", "asyndeton", "apocope"],
    distractorTypes: ["misspelling", "real", "real"]
  },
  {
    level: 70,
    definition: "The logical fallacy of appealing to the authority of an expert as sufficient proof of a claim — assuming something must be true because someone important said so",
    correct: "argumentum ad verecundiam",
    distractors: ["ad hominem", "argumentum ad vericundiam", "ipse dixit"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 71,
    definition: "The deliberate repetition of conjunctions such as 'and' or 'but' between each item in a list, slowing the pace of a sentence and creating a sense of accumulation",
    correct: "polysyndeton",
    distractors: ["asyndeton", "polisyndeton", "syndeton"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 72,
    definition: "A word derived from the name of a real or legendary person — for example, 'boycott' from Charles Boycott, or 'sandwich' from the Earl of Sandwich",
    correct: "eponym",
    distractors: ["toponym", "toponymy", "eponomyn"],
    distractorTypes: ["real", "real", "misspelling"]
  },
  {
    level: 73,
    definition: "A rhetorical device in which the same word or phrase is repeated at the end of successive clauses or sentences — the mirror image of anaphora",
    correct: "epistrophe",
    distractors: ["anaphora", "epastrophe", "epanalepsis"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 74,
    definition: "The linguistic property of a single word having two meanings that are directly opposite to each other — for example, 'sanction' (which can mean both to authorize and to penalize) or 'cleave' (both to split apart and to cling to)",
    correct: "enantiosemy",
    distractors: ["polysemy", "enantiosemie", "contranymy"],
    distractorTypes: ["real", "misspelling", "misspelling"]
  },
  {
    level: 75,
    definition: "The ancient practice of predicting the future by examining the internal organs — especially the liver — of sacrificed animals",
    correct: "haruspicy",
    distractors: ["augury", "haruspex", "haruspacy"],
    distractorTypes: ["real", "real", "misspelling"]
  },

  // ── Levels 76–100: near-impossible ───────────────────────────────────────────
  {
    level: 76,
    definition: "The act of assigning a date to something that is earlier than its actual date of origin; placing a document or event falsely in the past",
    correct: "antedating",
    distractors: ["predating", "antedateing", "anachronism"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 77,
    definition: "A figure of speech in which the speaker expresses genuine or feigned uncertainty and doubt, inviting the audience to consider a difficult question alongside them",
    correct: "aporia",
    distractors: ["dubitatio", "aporeia", "perplexity"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 78,
    definition: "The view that moral standards are culturally specific and that no culture's moral code is objectively superior to any other's",
    correct: "moral relativism",
    distractors: ["nihilism", "moral relitivism", "ethical subjectivism"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 79,
    definition: "The dropping of one or more sounds from the beginning of a word — for example, 'twixt' from 'betwixt,' or 'bout' from 'about'",
    correct: "aphaeresis",
    distractors: ["apocope", "aphearesis", "syncope"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 80,
    definition: "A contradiction between two laws, principles, or propositions that seem equally valid — an irresolvable logical conflict",
    correct: "antinomy",
    distractors: ["paradox", "antimonee", "antimony"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 81,
    definition: "A rhetorical technique in which the speaker pretends to refuse or pass over something while actually drawing full attention to it — for example, 'I won't mention his drinking problem'",
    correct: "apophasis",
    distractors: ["apophysis", "preterition", "apophatis"],
    distractorTypes: ["real", "real", "misspelling"]
  },
  {
    level: 82,
    definition: "The philosophical study of the nature of moral claims themselves — asking not 'what is right?' but 'what does it even mean for something to be right?'",
    correct: "metaethics",
    distractors: ["deontology", "metaethicks", "axiology"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 83,
    definition: "A figure of speech in which an adjective or modifier is transferred from the noun it logically belongs with to another noun in the same sentence — for example, 'the plowman plods his weary way home,' where it is the plowman, not the way, who is weary",
    correct: "hypallage",
    distractors: ["enallage", "hypallege", "hyperbaton"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 84,
    definition: "An abrupt descent from the elevated to the trivial or ridiculous within a piece of writing — the effect of suddenly dropping from a grand tone to something anticlimactic or absurd",
    correct: "bathos",
    distractors: ["anticlimax", "pathos", "bathoss"],
    distractorTypes: ["real", "real", "misspelling"]
  },
  {
    level: 85,
    definition: "A word or expression that occurs only once in a body of literature, in an author's entire surviving works, or across the recorded instances of a language — making its meaning sometimes impossible to determine with certainty",
    correct: "hapax legomenon",
    distractors: ["nonce word", "hapex legomenon", "dis legomenon"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 86,
    definition: "The dropping of a sound or syllable from the end of a word — for example, 'singin'' for 'singing,' or 'ol'' for 'old'",
    correct: "apocope",
    distractors: ["syncope", "apcope", "aphaeresis"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 87,
    definition: "A rhetorical question asked purely for effect, with no answer expected — used to emphasize a point or stir the listener's emotions",
    correct: "erotema",
    distractors: ["eroteme", "hypophora", "erotima"],
    distractorTypes: ["real", "real", "misspelling"]
  },
  {
    level: 88,
    definition: "The substitution of a harsh, offensive, or blunt expression for a neutral or positive one — making something sound worse than it is; the deliberate opposite of euphemism",
    correct: "dysphemism",
    distractors: ["euphemism", "dysphemizm", "malediction"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 89,
    definition: "The substitution of one grammatical form for another to achieve a specific rhetorical effect — for example, using the present tense to describe a past event, making it feel immediate",
    correct: "enallage",
    distractors: ["syllepsis", "enalage", "hypallage"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 90,
    definition: "Divination by observing the behavior, flight patterns, and sounds of birds",
    correct: "ornithomancy",
    distractors: ["augury", "orinthomancy", "alectromancy"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 91,
    definition: "A figure of speech in which two words connected by a conjunction express a single complex idea that would normally be expressed as a noun modified by an adjective — for example, 'sound and fury' for 'furious sound'",
    correct: "hendiadys",
    distractors: ["zeugma", "hendiadis", "syllepsis"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 92,
    definition: "The philosophical view that abstract entities such as numbers, universals, or ideal forms exist independently of and prior to the human mind",
    correct: "Platonism",
    distractors: ["idealism", "platonizm", "realism"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 93,
    definition: "In logic, a form of reasoning that infers the most likely explanation from a set of observations — reasoning from evidence to the simplest hypothesis that would explain it",
    correct: "abduction",
    distractors: ["induction", "abdution", "retroduction"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 94,
    definition: "The use of a descriptive phrase, title, or epithet in place of a proper name — or conversely, the use of a proper name to stand for a general type (e.g. 'a Scrooge' to mean a miser)",
    correct: "antonomasia",
    distractors: ["eponym", "antanomasia", "synecdoche"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 95,
    definition: "The use of a longer phrase to refer to something that could be stated simply — a roundabout way of naming something, often to add dignity or avoid repetition",
    correct: "periphrasis",
    distractors: ["circumlocution", "periphasis", "antonomasia"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 96,
    definition: "A rhetorical figure in which the same words are repeated in reverse order in successive clauses — for example, 'Ask not what your country can do for you; ask what you can do for your country'",
    correct: "antimetabole",
    distractors: ["chiasmus", "antimetablee", "epanalepsis"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 97,
    definition: "The rhetorical technique of giving a voice, personality, or human form to an absent person, a deceased individual, or an abstract concept — making something speak that cannot speak",
    correct: "prosopopoeia",
    distractors: ["personification", "prosopeia", "enargeia"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 98,
    definition: "The study of rhythm, stress, and intonation in poetry; the analysis of metrical patterns in verse",
    correct: "prosody",
    distractors: ["metrics", "prosodie", "scansion"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 99,
    definition: "An irresistible urge to do something one knows to be inadvisable; a compulsion or bad habit one cannot seem to resist — famously invoked in the phrase 'cacoethes scribendi,' meaning an uncontrollable itch to write",
    correct: "cacoethes",
    distractors: ["compulsion", "cacoethon", "kleptomania"],
    distractorTypes: ["real", "misspelling", "real"]
  },
  {
    level: 100,
    definition: "The ancient art of predicting the future from the sounds, direction, and intensity of thunder",
    correct: "brontomancy",
    distractors: ["keraunomancy", "bruntomancy", "astrapomancy"],
    distractorTypes: ["real", "misspelling", "real"]
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
  if (q.distractorTypes.length !== 3) issues.push(`Level ${q.level}: distractorTypes must have 3 entries`);
  q.distractors.forEach(d => {
    if (d.toLowerCase() === q.correct.toLowerCase())
      issues.push(`Level ${q.level}: distractor "${d}" matches correct word`);
  });
});

if (issues.length) {
  console.error('⚠️  Validation issues:');
  issues.forEach(i => console.error('  •', i));
  process.exit(1);
} else {
  console.log('✅ All 100 questions validated.');
}

fs.writeFileSync('assets/data/lexi-questions.json', JSON.stringify(QUESTIONS, null, 2));
console.log(`📝 Written to assets/data/lexi-questions.json (${QUESTIONS.length} questions)`);
