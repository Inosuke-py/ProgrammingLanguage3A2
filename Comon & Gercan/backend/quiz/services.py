import re
from copy import deepcopy

from pypdf import PdfReader


FEATURES = {
    "concurrency": {
        "label": "Concurrency and Parallelism",
        "tagline": "Structure work so tasks can overlap, then run independent work at the same time when hardware allows it.",
        "languages": ["Go", "Rust", "Java", "Python", "C++"],
        "optimization": [
            "Use message passing or immutable data to reduce shared-state bugs.",
            "Choose parallelism for CPU-bound work and asynchronous concurrency for I/O-heavy work.",
            "Measure lock contention before adding threads; coordination overhead can erase speedups.",
        ],
        "questions": [
            {
                "prompt": "Which statement best separates concurrency from parallelism?",
                "choices": [
                    "Concurrency is about handling multiple tasks in progress; parallelism is about executing tasks simultaneously.",
                    "Concurrency always requires multiple CPU cores, while parallelism does not.",
                    "Parallelism only applies to web servers.",
                    "They are exact synonyms in programming language design.",
                ],
                "answer": 0,
                "explanation": "Concurrency is a design property; parallelism is a runtime execution property.",
            },
            {
                "prompt": "A language feature that most directly supports safe concurrent communication is:",
                "choices": ["Goto labels", "Channels", "Implicit integer casts", "Global mutable variables"],
                "answer": 1,
                "explanation": "Channels encourage tasks to exchange messages instead of sharing mutable memory directly.",
            },
            {
                "prompt": "What is a common performance risk in highly parallel programs?",
                "choices": ["Less source code", "Lock contention and synchronization overhead", "Too many comments", "Static typing"],
                "answer": 1,
                "explanation": "Threads can spend too much time waiting for locks or coordinating shared resources.",
            },
        ],
    },
    "duck_typing": {
        "label": "Duck Typing",
        "tagline": "Use an object's behavior instead of its declared type: if it has the needed methods, it can participate.",
        "languages": ["Python", "Ruby", "JavaScript", "TypeScript"],
        "optimization": [
            "Document expected methods with protocols, interfaces, or tests.",
            "Validate inputs at module boundaries so failures are early and clear.",
            "Use duck typing for flexible APIs, but avoid it where hidden contracts become expensive to debug.",
        ],
        "questions": [
            {
                "prompt": "Duck typing focuses mainly on:",
                "choices": [
                    "The object's available behavior",
                    "The object's exact class name",
                    "The amount of RAM installed",
                    "The compiler's optimization level",
                ],
                "answer": 0,
                "explanation": "Duck typing accepts values that provide the operations the code needs.",
            },
            {
                "prompt": "Which example best shows duck typing?",
                "choices": [
                    "Calling .draw() on any object that implements draw, regardless of its class",
                    "Rejecting every object that is not named Shape",
                    "Allocating stack memory manually",
                    "Running two functions on two CPU cores",
                ],
                "answer": 0,
                "explanation": "The call depends on the method being present, not on a specific inheritance tree.",
            },
            {
                "prompt": "A practical downside of duck typing is:",
                "choices": [
                    "It can hide interface mistakes until runtime",
                    "It prevents polymorphism",
                    "It requires dangling pointers",
                    "It disables all unit tests",
                ],
                "answer": 0,
                "explanation": "Without explicit type checks, missing methods may be discovered only when the code path runs.",
            },
        ],
    },
    "memory_overhead": {
        "label": "Memory Overhead",
        "tagline": "Account for metadata, allocation strategy, runtime services, and representation costs beyond the raw data.",
        "languages": ["C", "C++", "Java", "Python", "Rust"],
        "optimization": [
            "Prefer compact data layouts for large collections and hot paths.",
            "Reuse allocations where appropriate, but avoid pools that complicate ownership without measurable benefit.",
            "Profile object count and allocation churn before changing representations.",
        ],
        "questions": [
            {
                "prompt": "Memory overhead means:",
                "choices": [
                    "Extra memory used beyond the essential payload data",
                    "The number of syntax errors in a program",
                    "Only the size of the source file",
                    "A feature found only in assembly language",
                ],
                "answer": 0,
                "explanation": "Objects often carry headers, alignment padding, references, allocator metadata, or runtime bookkeeping.",
            },
            {
                "prompt": "Which choice often reduces memory overhead for many small numeric values?",
                "choices": [
                    "A packed array of primitives",
                    "A list of boxed objects with metadata",
                    "Duplicating every object",
                    "Adding more global variables",
                ],
                "answer": 0,
                "explanation": "Packed primitive arrays avoid per-object headers and pointer indirection.",
            },
            {
                "prompt": "Why can garbage collection add memory overhead?",
                "choices": [
                    "The runtime may keep metadata and delay reclamation until a collection cycle",
                    "It removes all objects instantly",
                    "It makes every value static",
                    "It prevents heap allocation",
                ],
                "answer": 0,
                "explanation": "Managed runtimes need bookkeeping and may retain unreachable objects until GC runs.",
            },
        ],
    },
    "dangling_pointers": {
        "label": "Dangling Pointers",
        "tagline": "Prevent references from outliving the memory they point to.",
        "languages": ["C", "C++", "Rust"],
        "optimization": [
            "Use ownership rules, RAII, smart pointers, or borrow checking to tie references to lifetimes.",
            "Set clear ownership at API boundaries and avoid returning addresses of local stack variables.",
            "Prefer safe abstractions for shared access; raw pointers should be narrow and audited.",
        ],
        "questions": [
            {
                "prompt": "A dangling pointer occurs when a pointer:",
                "choices": [
                    "Still refers to memory that has already been freed or gone out of scope",
                    "Points to a valid array element",
                    "Stores a Boolean value",
                    "Is used in a high-level language",
                ],
                "answer": 0,
                "explanation": "The pointer value remains, but the object it refers to is no longer valid.",
            },
            {
                "prompt": "Which language feature is designed to prevent many dangling pointer errors at compile time?",
                "choices": ["Rust's borrow checker", "Python's duck typing", "HTML tables", "JavaScript hoisting"],
                "answer": 0,
                "explanation": "Rust checks ownership and lifetimes so references cannot outlive borrowed data.",
            },
            {
                "prompt": "Which C/C++ practice reduces dangling pointer risk?",
                "choices": [
                    "Use RAII and smart pointers for ownership",
                    "Return pointers to local stack variables",
                    "Free the same pointer twice",
                    "Ignore object lifetimes",
                ],
                "answer": 0,
                "explanation": "RAII ties resource release to object lifetime, making ownership clearer.",
            },
        ],
    },
}


DIFFICULTY_NOTES = {
    "fundamentals": "Focus on definitions and recognition.",
    "applied": "Mix definitions with trade-offs and realistic design decisions.",
    "advanced": "Emphasize consequences, failure modes, and optimization choices.",
}


def build_quiz(topic_keys, difficulty, count):
    questions = []
    selected = [key for key in topic_keys if key in FEATURES] or list(FEATURES)

    for key in selected:
        for question in FEATURES[key]["questions"]:
            item = deepcopy(question)
            item["topic"] = FEATURES[key]["label"]
            item["topic_key"] = key
            item["difficulty"] = difficulty
            questions.append(item)

    if difficulty == "advanced":
        questions = list(reversed(questions))
    elif difficulty == "applied":
        questions = questions[1::2] + questions[::2]

    limit = max(1, min(int(count), len(questions)))
    return questions[:limit]


def feature_cards(topic_keys=None):
    selected = topic_keys or list(FEATURES)
    return [
        {"key": key, **FEATURES[key]}
        for key in selected
        if key in FEATURES
    ]


def extract_pdf_text(uploaded_file, max_chars=16000):
    reader = PdfReader(uploaded_file)
    chunks = []
    for page in reader.pages[:20]:
        text = page.extract_text() or ""
        if text.strip():
            chunks.append(text)

    cleaned = clean_text(" ".join(chunks))
    return cleaned[:max_chars]


def clean_text(text):
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    return text.strip()


def generate_questions_from_text(text, count=8):
    sentences = split_sentences(text)
    if not sentences:
        return []

    keywords = extract_keywords(text)
    questions = []
    generators = [
        build_pdf_mcq_question,
        build_pdf_true_false_question,
        build_pdf_short_answer_question,
    ]

    for index, sentence in enumerate(sentences):
        if len(questions) >= count:
            break
        question = generators[index % len(generators)](sentence, keywords, index)
        if question:
            questions.append(question)

    return questions


def split_sentences(text):
    raw = re.split(r"(?<=[.!?])\s+", text)
    sentences = []
    for sentence in raw:
        sentence = clean_text(sentence)
        word_count = len(sentence.split())
        if 8 <= word_count <= 38:
            sentences.append(sentence)
    return sentences[:40]


def extract_keywords(text):
    stop_words = {
        "about", "after", "also", "because", "before", "between", "could", "from",
        "have", "into", "more", "most", "only", "other", "should", "such", "than",
        "that", "their", "there", "these", "this", "through", "using", "when",
        "where", "which", "while", "with", "would", "program", "programming",
    }
    words = re.findall(r"[A-Za-z][A-Za-z\-]{3,}", text.lower())
    counts = {}
    for word in words:
        if word not in stop_words:
            counts[word] = counts.get(word, 0) + 1
    ranked = sorted(counts, key=lambda word: (-counts[word], word))
    return [word.title() for word in ranked[:24]]


def build_pdf_mcq_question(sentence, keywords, index):
    answer = best_answer_phrase(sentence, keywords)
    distractors = [keyword for keyword in keywords if keyword.lower() != answer.lower()][:3]
    fallback = ["Concurrency", "Memory Safety", "Type System", "Runtime Overhead"]
    distractors = (distractors + fallback)[:3]
    choices = [answer] + distractors
    return {
        "type": "mcq",
        "topic": "Imported PDF",
        "topic_key": "imported_pdf",
        "difficulty": "applied",
        "prompt": f"According to the document, which concept best matches this idea: {sentence}",
        "choices": choices,
        "answer": 0,
        "explanation": f"This question was generated from the sentence: {sentence}",
    }


def build_pdf_true_false_question(sentence, keywords, index):
    return {
        "type": "true_false",
        "topic": "Imported PDF",
        "topic_key": "imported_pdf",
        "difficulty": "applied",
        "prompt": f"True or False: {sentence}",
        "choices": ["True", "False"],
        "answer": 0,
        "explanation": "This statement is taken directly from the imported PDF text.",
    }


def build_pdf_short_answer_question(sentence, keywords, index):
    answer = best_answer_phrase(sentence, keywords)
    return {
        "type": "short_answer",
        "topic": "Imported PDF",
        "topic_key": "imported_pdf",
        "difficulty": "applied",
        "prompt": f"In a few words, what key concept is described here: {sentence}",
        "choices": [],
        "answer": answer,
        "explanation": f"A strong answer should mention {answer}.",
    }


def best_answer_phrase(sentence, keywords):
    lower_sentence = sentence.lower()
    for keyword in keywords:
        if keyword.lower() in lower_sentence:
            return keyword

    words = re.findall(r"[A-Za-z][A-Za-z\-]{4,}", sentence)
    if words:
        return max(words, key=len).title()
    return "Main Concept"
