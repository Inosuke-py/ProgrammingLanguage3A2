// ============================================================
// PL Concepts Lab — Pyodide + CodeMirror powered
// Runs real Python in the browser via WebAssembly
// ============================================================

let pyodide = null;
const editors = {};

// ===== CODE EXAMPLES =====
const examples = {
    duck: [
        `# Basic Duck Typing
class Duck:
    def quack(self):
        return "Quack! Quack!"
    def swim(self):
        return "The duck is swimming."

class Person:
    def quack(self):
        return "I'm quacking like a duck!"
    def swim(self):
        return "I'm swimming like a duck!"

class Car:
    def drive(self):
        return "Vroom vroom!"

def make_it_quack(thing):
    """We don't care WHAT it is, only that it can quack."""
    print(f"{type(thing).__name__} says: {thing.quack()}")

def make_it_swim(thing):
    print(f"{type(thing).__name__}: {thing.swim()}")

# All these work — no inheritance needed!
make_it_quack(Duck())
make_it_quack(Person())
make_it_swim(Duck())
make_it_swim(Person())

# This will fail — Car can't quack
try:
    make_it_quack(Car())
except AttributeError as e:
    print(f"\\nError: {e}")
    print("Car doesn't have quack() — duck typing caught it at runtime!")
`,
        `# Protocol / Structural Typing (Python 3.8+)
from typing import Protocol, runtime_checkable

@runtime_checkable
class Drawable(Protocol):
    def draw(self) -> str: ...

class Circle:
    def draw(self) -> str:
        return "Drawing a circle: O"

class Square:
    def draw(self) -> str:
        return "Drawing a square: []"

class Cat:
    def meow(self) -> str:
        return "Meow!"

def render(shape):
    """Duck typing with Protocol check."""
    if isinstance(shape, Drawable):
        print(f"  ✓ {shape.draw()}")
    else:
        print(f"  ✗ {type(shape).__name__} is not Drawable")

print("=== Structural Typing with Protocol ===")
print("No inheritance needed — just implement draw()!\\n")
render(Circle())
render(Square())
render(Cat())

print("\\n--- isinstance checks ---")
print(f"Circle is Drawable? {isinstance(Circle(), Drawable)}")
print(f"Cat is Drawable?    {isinstance(Cat(), Drawable)}")
`,
        `# EAFP vs LBYL
# EAFP = Easier to Ask Forgiveness than Permission (Pythonic)
# LBYL = Look Before You Leap (traditional)

class FileReader:
    def __init__(self, data=None):
        self.data = data
    def read(self):
        if self.data is None:
            raise IOError("No data available")
        return self.data

class NetworkStream:
    def read(self):
        return "bytes from network..."

def process_lbyl(source):
    """LBYL style — check everything up front (NOT Pythonic)"""
    if not isinstance(source, (FileReader, NetworkStream)):
        return "Cannot read (wrong type)"
    if not hasattr(source, 'read'):
        return "Cannot read (no read method)"
    # Have to know FileReader's internals to avoid an IOError:
    if isinstance(source, FileReader) and source.data is None:
        return "Cannot read (no data)"
    return source.read()

def process_eafp(source):
    """EAFP style — just try it (Pythonic duck typing)"""
    try:
        return source.read()
    except (AttributeError, IOError) as e:
        return f"Failed: {e}"

print("=== EAFP vs LBYL ===\\n")
sources = [FileReader("hello!"), NetworkStream(), FileReader(), "not a reader"]

for s in sources:
    name = type(s).__name__
    print(f"{name}:")
    print(f"  LBYL: {process_lbyl(s)}")
    print(f"  EAFP: {process_eafp(s)}")
    print()
`
    ],
    polymorphism: [
        `# Method Overriding (Subtype Polymorphism)
class Shape:
    def area(self):
        raise NotImplementedError
    def describe(self):
        return f"{type(self).__name__}: area = {self.area():.2f}"

class Circle(Shape):
    def __init__(self, radius):
        self.radius = radius
    def area(self):
        import math
        return math.pi * self.radius ** 2

class Rectangle(Shape):
    def __init__(self, w, h):
        self.w, self.h = w, h
    def area(self):
        return self.w * self.h

class Triangle(Shape):
    def __init__(self, base, height):
        self.base, self.height = base, height
    def area(self):
        return 0.5 * self.base * self.height

# Same interface, different behavior
shapes = [Circle(5), Rectangle(4, 6), Triangle(3, 8)]
print("=== Subtype Polymorphism ===\\n")
for shape in shapes:
    print(f"  {shape.describe()}")

print(f"\\nTotal area: {sum(s.area() for s in shapes):.2f}")
`,
        `# Operator Overloading (Ad-hoc Polymorphism)
class Vector:
    def __init__(self, x, y):
        self.x, self.y = x, y

    def __add__(self, other):
        return Vector(self.x + other.x, self.y + other.y)

    def __mul__(self, scalar):
        return Vector(self.x * scalar, self.y * scalar)

    def __eq__(self, other):
        return self.x == other.x and self.y == other.y

    def __repr__(self):
        return f"Vector({self.x}, {self.y})"

    def __abs__(self):
        return (self.x**2 + self.y**2) ** 0.5

v1 = Vector(2, 3)
v2 = Vector(1, -1)

print("=== Operator Overloading ===\\n")
print(f"v1 = {v1}")
print(f"v2 = {v2}")
print(f"v1 + v2 = {v1 + v2}")
print(f"v1 * 3  = {v1 * 3}")
print(f"|v1|    = {abs(v1):.2f}")
print(f"v1 == v2? {v1 == v2}")
print(f"v1 == Vector(2,3)? {v1 == Vector(2,3)}")
`,
        `# Parametric Polymorphism (Generic Functions)
from functools import singledispatch

@singledispatch
def process(data):
    """Default handler for unknown types."""
    print(f"  Don't know how to process {type(data).__name__}: {data}")

@process.register(int)
def _(data):
    print(f"  Integer: {data} → squared = {data**2}")

@process.register(str)
def _(data):
    print(f"  String: '{data}' → upper = '{data.upper()}'")

@process.register(list)
def _(data):
    print(f"  List: {data} → sum = {sum(data) if all(isinstance(x, (int,float)) for x in data) else 'N/A'}")

@process.register(dict)
def _(data):
    print(f"  Dict: {len(data)} keys → {list(data.keys())}")

print("=== Parametric Polymorphism (singledispatch) ===\\n")
test_data = [42, "hello world", [1, 2, 3, 4], {"a": 1, "b": 2}, 3.14]
for item in test_data:
    process(item)
`
    ],
    "static-dynamic": [
        `# Type Mismatch — Python discovers at RUNTIME
def add_numbers(a, b):
    """No type declarations needed."""
    return a + b

print("=== Dynamic Typing: Type Mismatch ===\\n")

# These work fine
print(f"add_numbers(2, 3)     = {add_numbers(2, 3)}")
print(f"add_numbers('a', 'b') = {add_numbers('a', 'b')}")

# This crashes at runtime — not caught until executed
print("\\nNow trying add_numbers(1, '2')...")
try:
    result = add_numbers(1, "2")
    print(f"Result: {result}")
except TypeError as e:
    print(f"TypeError: {e}")
    print("Python only found this bug when the line EXECUTED!")
`,
        `# Late Binding Surprise
print("=== Late Binding in Dynamic Typing ===\\n")

# Classic Python gotcha: closures capture variables by reference
functions = []
for i in range(5):
    functions.append(lambda: i)

print("Expected: 0, 1, 2, 3, 4")
print("Got:     ", ", ".join(str(f()) for f in functions))
print("All return 4! The variable 'i' is looked up at CALL time.\\n")

# Fix: capture with default argument
functions_fixed = []
for i in range(5):
    functions_fixed.append(lambda i=i: i)

print("Fixed (default arg capture):")
print("Got:     ", ", ".join(str(f()) for f in functions_fixed))
`,
        `# Type Annotations (Python 3.10+)
# These are HINTS — Python doesn't enforce them at runtime!

def greet(name: str, times: int = 1) -> str:
    return (f"Hello, {name}! " * times).strip()

def add(a: int, b: int) -> int:
    return a + b

print("=== Type Annotations (hints, not enforcement) ===\\n")

# Correct usage
print(greet("Alice", 2))
print(f"add(3, 4) = {add(3, 4)}")

# "Wrong" types — Python runs it anyway!
print(f"\\nadd('hello', ' world') = {add('hello', ' world')}")
print("^ No error! Annotations are just documentation.")

# Show the annotations
print(f"\\ngreet.__annotations__ = {greet.__annotations__}")
print(f"add.__annotations__   = {add.__annotations__}")
print("\\nUse mypy or pyright for static checking!")
`
    ],
    "strong-weak": [
        `# Adding int + string
print("=== Strong Typing: int + string ===\\n")

a = 1
b = "2"

print(f"a = {a} (type: {type(a).__name__})")
print(f"b = {b} (type: {type(b).__name__})")
print()

# Python REFUSES to coerce
try:
    result = a + b
except TypeError as e:
    print(f"a + b → TypeError: {e}")
    print("Python won't silently convert!")

print(f"\\nExplicit conversion:")
print(f"  str(a) + b = '{str(a) + b}'")
print(f"  a + int(b) = {a + int(b)}")
`,
        `# Truthiness Rules
print("=== Python Truthiness ===\\n")

test_values = [0, 1, -1, "", "hello", [], [0], {}, None, 0.0, 0j]

print(f"{'Value':<12} {'Type':<10} {'bool()':<8}")
print("-" * 32)
for val in test_values:
    print(f"{repr(val):<12} {type(val).__name__:<10} {bool(val)}")

print("\\nPython is CONSISTENT: empty/zero = False, everything else = True")
print("No weird coercion like JS's '' == 0 being True!")
`,
        `# Comparison Coercion
print("=== Strong Typing: Comparisons ===\\n")

pairs = [
    (1, "1"),
    (0, ""),
    (0, []),
    (1, True),
    (0, False),
    ("1", True),
]

for a, b in pairs:
    try:
        result = a == b
        print(f"  {repr(a):>6} == {repr(b):<8} → {result}")
    except TypeError as e:
        print(f"  {repr(a):>6} == {repr(b):<8} → TypeError!")

print("\\nPython only coerces numbers ↔ bools (bool is subclass of int)")
print("Everything else: different type = not equal. No magic.")
`
    ],
    inheritance: [
        `# Single Inheritance + super()
class Animal:
    def __init__(self, name, sound):
        self.name = name
        self.sound = sound
        print(f"  Animal.__init__({name})")

    def speak(self):
        return f"{self.name} says {self.sound}!"

    def __repr__(self):
        return f"{type(self).__name__}('{self.name}')"

class Dog(Animal):
    def __init__(self, name, breed):
        super().__init__(name, "Woof")  # calls Animal.__init__
        self.breed = breed
        print(f"  Dog.__init__({name}, {breed})")

    def fetch(self):
        return f"{self.name} fetches the ball!"

class GuideDog(Dog):
    def __init__(self, name, breed, handler):
        super().__init__(name, breed)  # calls Dog.__init__
        self.handler = handler
        print(f"  GuideDog.__init__({name}, handler={handler})")

    def guide(self):
        return f"{self.name} guides {self.handler} safely."

print("=== Single Inheritance + super() ===\\n")
print("Creating GuideDog (calls chain up):")
rex = GuideDog("Rex", "Labrador", "Alice")
print(f"\\n{rex}")
print(rex.speak())    # from Animal
print(rex.fetch())    # from Dog
print(rex.guide())    # from GuideDog
print(f"\\nMRO: {[c.__name__ for c in GuideDog.__mro__]}")
`,
        `# Multiple Inheritance & MRO
class A:
    def who(self):
        return "A"

class B(A):
    def who(self):
        return "B -> " + super().who()

class C(A):
    def who(self):
        return "C -> " + super().who()

class D(B, C):
    def who(self):
        return "D -> " + super().who()

print("=== Multiple Inheritance & MRO ===\\n")
print("Class hierarchy:")
print("      A")
print("     / \\\\")
print("    B   C")
print("     \\\\ /")
print("      D\\n")

d = D()
print(f"d.who() = '{d.who()}'")
print(f"\\nMRO (Method Resolution Order):")
for i, cls in enumerate(D.__mro__):
    print(f"  {i}. {cls.__name__}")

print("\\nPython uses C3 linearization — predictable, no diamonds!")
`,
        `# Mixin Pattern
class JsonMixin:
    """Adds JSON serialization to any class with a to_dict() method."""
    def to_json(self):
        import json
        return json.dumps(self.to_dict(), indent=2)

class ValidatorMixin:
    """Adds validation capability."""
    def validate(self):
        for field, rules in getattr(self, '_validators', {}).items():
            value = getattr(self, field, None)
            for rule in rules:
                if not rule(value):
                    raise ValueError(f"Validation failed for {field}={value}")
        return True

class User(JsonMixin, ValidatorMixin):
    _validators = {
        'age': [lambda x: x is not None, lambda x: x >= 0]
    }
    def __init__(self, name, age):
        self.name = name
        self.age = age
    def to_dict(self):
        return {"name": self.name, "age": self.age}

print("=== Mixin Pattern ===\\n")
user = User("Alice", 30)
print(f"user.to_json():\\n{user.to_json()}")
print(f"\\nuser.validate() = {user.validate()}")

print(f"\\nMRO: {[c.__name__ for c in User.__mro__]}")
print("\\nMixins add capabilities without deep inheritance!")
`
    ],
    encapsulation: [
        `# Convention-based Privacy
class BankAccount:
    def __init__(self, owner, balance=0):
        self.owner = owner          # public
        self._balance = balance     # "private" by convention
        self._transactions = []     # "private" by convention

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("Amount must be positive")
        self._balance += amount
        self._transactions.append(f"+{amount}")
        return self

    def withdraw(self, amount):
        if amount > self._balance:
            raise ValueError("Insufficient funds")
        self._balance -= amount
        self._transactions.append(f"-{amount}")
        return self

    def get_balance(self):
        return self._balance

    def statement(self):
        return f"{self.owner}: ${self._balance} | History: {self._transactions}"

print("=== Convention-based Privacy ===\\n")
acc = BankAccount("Alice", 100)
acc.deposit(50).withdraw(30)
print(acc.statement())

# We CAN access _balance — it's just a convention
print(f"\\nDirect access (not recommended): acc._balance = {acc._balance}")
print("Python trusts you to respect the underscore convention!")
`,
        `# Name Mangling (__dunder)
class Secret:
    def __init__(self):
        self.public = "anyone can see this"
        self._protected = "please don't touch"
        self.__private = "name-mangled!"

    def reveal(self):
        return self.__private

print("=== Name Mangling ===\\n")
s = Secret()

print(f"s.public     = '{s.public}'")
print(f"s._protected = '{s._protected}'")

try:
    print(f"s.__private  = '{s.__private}'")
except AttributeError as e:
    print(f"s.__private  → AttributeError: {e}")

# But it's still accessible via mangled name!
print(f"\\nMangled name: s._Secret__private = '{s._Secret__private}'")
print(f"Method access: s.reveal() = '{s.reveal()}'")

print(f"\\nAll attributes: {[a for a in dir(s) if not a.startswith('__')]}")
print("\\nName mangling prevents ACCIDENTAL access, not determined access.")
`,
        `# @property Getters/Setters
class Temperature:
    def __init__(self, celsius=0):
        self._celsius = celsius  # internal storage

    @property
    def celsius(self):
        return self._celsius

    @celsius.setter
    def celsius(self, value):
        if value < -273.15:
            raise ValueError("Below absolute zero!")
        self._celsius = value

    @property
    def fahrenheit(self):
        return self._celsius * 9/5 + 32

    @fahrenheit.setter
    def fahrenheit(self, value):
        self.celsius = (value - 32) * 5/9

    def __repr__(self):
        return f"Temperature({self._celsius}°C / {self.fahrenheit}°F)"

print("=== @property Getters/Setters ===\\n")
t = Temperature(25)
print(f"Initial: {t}")

t.celsius = 100
print(f"Set celsius=100: {t}")

t.fahrenheit = 32
print(f"Set fahrenheit=32: {t}")

print(f"\\nValidation in action:")
try:
    t.celsius = -300
except ValueError as e:
    print(f"  t.celsius = -300 → ValueError: {e}")

print("\\n@property gives you attribute syntax with method power!")
`
    ],
    playground: [
        `# Free Playground — experiment with anything!
# Combine duck typing, polymorphism, inheritance...

class Printable:
    """Mixin: anything with to_str() can be printed nicely."""
    def pretty_print(self):
        print(f"[{type(self).__name__}] {self.to_str()}")

class Animal(Printable):
    def __init__(self, name):
        self.name = name
    def speak(self):
        return "..."
    def to_str(self):
        return f"{self.name} says '{self.speak()}'"

class Dog(Animal):
    def speak(self):
        return "Woof!"
    def fetch(self):
        return f"{self.name} fetches the ball!"

class Cat(Animal):
    def speak(self):
        return "Meow!"
    def purr(self):
        return f"{self.name} purrs contentedly..."

# Duck typing: process anything with speak()
def chorus(animals):
    print("🎵 Animal Chorus:")
    for a in animals:
        if hasattr(a, 'speak'):
            a.pretty_print()

chorus([Dog("Rex"), Cat("Whiskers"), Dog("Buddy")])
`
    ]
};

// ===== JAVA COMPARISON CODE =====
const javaExamples = {
    "static-dynamic": [
        `// Java — Type Mismatch (caught at COMPILE time)
public class Main {
    static int addNumbers(int a, int b) {
        return a + b;
    }

    public static void main(String[] args) {
        System.out.println(addNumbers(2, 3));    // OK
        System.out.println(addNumbers(1, "2"));  // COMPILE ERROR!
        // error: incompatible types: String cannot
        // be converted to int
    }
}`,
        `// Java — No late binding surprise
// Variables are typed, closures capture values differently
import java.util.*;
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        List<Supplier<Integer>> fns = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            final int captured = i;  // must be final/effectively final
            fns.add(() -> captured);
        }
        // Prints: 0, 1, 2, 3, 4 — no surprise!
        fns.forEach(f -> System.out.print(f.get() + " "));
    }
}`,
        `// Java — Type annotations are ENFORCED
public class Main {
    static String greet(String name, int times) {
        return (name + "! ").repeat(times).trim();
    }

    static int add(int a, int b) {
        return a + b;
    }

    public static void main(String[] args) {
        System.out.println(greet("Alice", 2));
        System.out.println(add(3, 4));

        // This WON'T COMPILE:
        // System.out.println(add("hello", " world"));
        // error: incompatible types
    }
}`
    ]
};

// ===== JS COMPARISON CODE =====
const jsExamples = {
    "strong-weak": [
        `// Adding int + string in JavaScript
console.log("=== Weak Typing: int + string ===\\n");

let a = 1;
let b = "2";

console.log("a = " + a + " (type: " + typeof a + ")");
console.log("b = " + b + " (type: " + typeof b + ")");
console.log("");

// JavaScript HAPPILY coerces!
console.log("a + b = " + (a + b) + "  ← string concatenation!");
console.log("a - b = " + (a - b) + "   ← numeric subtraction!");
console.log("a * b = " + (a * b) + "   ← numeric multiplication!");
console.log("");
console.log("JS coerces based on the operator. + prefers strings.");`,
        `// Truthiness in JavaScript
console.log("=== JavaScript Truthiness ===\\n");

let values = [0, 1, -1, "", "hello", [], [0], {}, null, undefined, NaN, "0", "false"];

values.forEach(val => {
    let repr = JSON.stringify(val);
    if (val === undefined) repr = "undefined";
    if (Number.isNaN(val)) repr = "NaN";
    console.log("  " + String(repr).padEnd(12) + " → " + Boolean(val));
});

console.log("\\nSurprises: [] is truthy, '0' is truthy, but 0 is falsy!");
console.log("'' == 0 is " + ('' == 0) + " but '' === 0 is " + ('' === 0));`,
        `// Comparison Coercion in JavaScript
console.log("=== Weak Typing: Comparison Coercion ===\\n");

let pairs = [
    [1, "1"],
    [0, ""],
    [0, []],
    [1, true],
    [0, false],
    ["1", true],
    [null, undefined],
    [NaN, NaN],
];

function show(v) {
    if (v === undefined) return "undefined";
    if (v === null) return "null";
    if (typeof v === "number" && Number.isNaN(v)) return "NaN";
    if (typeof v === "string") return '"' + v + '"';
    return JSON.stringify(v);
}

console.log("  == (loose):");
pairs.forEach(([a, b]) => {
    console.log("    " + show(a).padEnd(10) + " == " + show(b).padEnd(10) + " → " + (a == b));
});

console.log("\\n  === (strict):");
pairs.forEach(([a, b]) => {
    console.log("    " + show(a).padEnd(10) + " === " + show(b).padEnd(10) + " → " + (a === b));
});

console.log("\\nLesson: always use === in JavaScript!");`
    ]
};

// ===== STATIC CHECK RESULTS =====
const staticCheckResults = {
    "static-dynamic": [
        `❌ COMPILE ERROR at line 7:
   error: incompatible types: String cannot be converted to int
       System.out.println(addNumbers(1, "2"));
                                         ^
   1 error

The Java compiler catches this BEFORE the program runs.
In Python, this only fails when the line executes.`,
        `✓ COMPILES SUCCESSFULLY

Java captures loop variables correctly because:
- Lambda can only capture effectively-final variables
- The compiler forces you to think about it
- No late-binding surprise possible`,
        `❌ COMPILE ERROR at line 12:
   error: incompatible types: String cannot be converted to int
       System.out.println(add("hello", " world"));
                              ^
   1 error

Java's type system prevents this at compile time.
Python's annotations are just hints — not enforced.`
    ]
};

// ===== PYODIDE INITIALIZATION =====
async function initPyodide() {
    const status = document.getElementById('loading-status');
    try {
        status.textContent = '⏳ Loading…';
        pyodide = await loadPyodide();
        status.textContent = '✅ Ready!';
        setTimeout(() => {
            document.getElementById('loading-overlay').classList.add('hidden');
        }, 500);
    } catch (e) {
        status.textContent = `❌ Failed to load: ${e.message}`;
        // Still allow the app to work with a fallback
        setTimeout(() => {
            document.getElementById('loading-overlay').classList.add('hidden');
        }, 2000);
    }
}

// ===== CODEMIRROR INITIALIZATION =====
function initEditors() {
    const editorIds = [
        'editor-duck', 'editor-polymorphism', 'editor-static-dynamic',
        'editor-static-dynamic-java', 'editor-strong-weak', 'editor-strong-weak-js',
        'editor-inheritance', 'editor-encapsulation', 'editor-playground'
    ];

    editorIds.forEach(id => {
        const textarea = document.getElementById(id);
        if (!textarea) return;

        const isJava = id.includes('java');
        const isJS = id.includes('-js');
        const mode = isJava ? 'text/x-java' : isJS ? 'javascript' : 'python';
        const readOnly = isJava;

        editors[id] = CodeMirror.fromTextArea(textarea, {
            mode: mode,
            theme: 'dracula',
            lineNumbers: true,
            indentUnit: 4,
            tabSize: 4,
            indentWithTabs: false,
            lineWrapping: true,
            readOnly: readOnly,
            matchBrackets: true,
            autoCloseBrackets: true
        });
    });

    // Load initial examples
    loadExample('duck', 0);
    loadExample('polymorphism', 0);
    loadExample('static-dynamic', 0);
    loadExample('strong-weak', 0);
    loadExample('inheritance', 0);
    loadExample('encapsulation', 0);
    loadExample('playground', 0);
}

// ===== LOAD EXAMPLE INTO EDITOR =====
function loadExample(tab, index) {
    const editorKey = `editor-${tab}`;
    if (editors[editorKey] && examples[tab] && examples[tab][index]) {
        editors[editorKey].setValue(examples[tab][index]);
    }

    // Load Java comparison if applicable
    const javaKey = `editor-${tab}-java`;
    if (editors[javaKey] && javaExamples[tab] && javaExamples[tab][index]) {
        editors[javaKey].setValue(javaExamples[tab][index]);
    }

    // Load JS comparison if applicable
    const jsKey = `editor-${tab}-js`;
    if (editors[jsKey] && jsExamples[tab] && jsExamples[tab][index]) {
        editors[jsKey].setValue(jsExamples[tab][index]);
    }
}

// ===== RUN PYTHON CODE =====
async function runCode(tab) {
    const editorKey = `editor-${tab}`;
    const outputId = `output-${tab}`;
    const output = document.getElementById(outputId);

    if (!output) return;
    output.innerHTML = '';

    const code = editors[editorKey] ? editors[editorKey].getValue() : '';

    if (!pyodide) {
        output.innerHTML = '<span class="error">⚠️ Python runtime not loaded yet. Please wait...</span>';
        return;
    }

    try {
        // Redirect stdout/stderr
        pyodide.runPython(`
import sys
from io import StringIO
sys.stdout = StringIO()
sys.stderr = StringIO()
`);
        // Run user code
        pyodide.runPython(code);

        // Capture output
        const stdout = pyodide.runPython('sys.stdout.getvalue()');
        const stderr = pyodide.runPython('sys.stderr.getvalue()');

        if (stdout) output.textContent = stdout;
        if (stderr) output.innerHTML += `<span class="error">${escapeHtml(stderr)}</span>`;
        if (!stdout && !stderr) output.textContent = '(no output)';

    } catch (e) {
        output.innerHTML = `<span class="error">${escapeHtml(e.message)}</span>`;
    } finally {
        // Reset stdout/stderr
        try {
            pyodide.runPython(`
import sys
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
`);
        } catch(e) {}
    }
}

// ===== RUN JAVASCRIPT CODE =====
function runJS(tab) {
    const editorKey = `editor-${tab}-js`;
    const outputId = `output-${tab}-js`;
    const output = document.getElementById(outputId);

    if (!output) return;
    output.innerHTML = '';

    const code = editors[editorKey] ? editors[editorKey].getValue() : '';

    // Capture console.log output
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => {
        logs.push(args.map(a => {
            if (a === null) return 'null';
            if (a === undefined) return 'undefined';
            if (typeof a === 'object') return JSON.stringify(a);
            return String(a);
        }).join(' '));
    };

    try {
        eval(code);
        output.textContent = logs.join('\n') || '(no output)';
    } catch (e) {
        output.innerHTML = logs.join('\n') + `\n<span class="error">${escapeHtml(e.toString())}</span>`;
    } finally {
        console.log = originalLog;
    }
}

// ===== STATIC CHECK (Java simulation) =====
function runStaticCheck(tab) {
    const select = document.querySelector(`.example-select[data-target="${tab}"]`);
    const index = select ? parseInt(select.value) : 0;
    const outputId = `output-${tab}-java`;
    const output = document.getElementById(outputId);

    if (!output) return;
    if (staticCheckResults[tab] && staticCheckResults[tab][index]) {
        output.textContent = staticCheckResults[tab][index];
    } else {
        output.textContent = '✓ No static analysis available for this example.';
    }
}

// ===== UI HELPERS =====
function clearOutput(tab) {
    const output = document.getElementById(`output-${tab}`);
    if (output) output.textContent = '';
}

function resetEditor(tab) {
    const select = document.querySelector(`.example-select[data-target="${tab}"]`);
    const index = select ? parseInt(select.value) : 0;
    loadExample(tab, index);
    clearOutput(tab);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== TAB NAVIGATION =====
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;

            // Update buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update panels
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            const panel = document.getElementById(`tab-${target}`);
            if (panel) panel.classList.add('active');

            // Refresh CodeMirror (fixes rendering when tab was hidden)
            setTimeout(() => {
                Object.values(editors).forEach(ed => ed.refresh());
            }, 50);
        });
    });
}

// ===== EXAMPLE SELECT HANDLERS =====
function initExampleSelects() {
    document.querySelectorAll('.example-select').forEach(select => {
        select.addEventListener('change', () => {
            const tab = select.dataset.target;
            const index = parseInt(select.value);
            loadExample(tab, index);
            clearOutput(tab);
            // Clear java/js outputs too
            const javaOutput = document.getElementById(`output-${tab}-java`);
            if (javaOutput) javaOutput.textContent = '';
            const jsOutput = document.getElementById(`output-${tab}-js`);
            if (jsOutput) jsOutput.textContent = '';
        });
    });
}

// ===== KEYBOARD SHORTCUTS =====
function initKeyboard() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+Enter to run current tab
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            const activePanel = document.querySelector('.tab-panel.active');
            if (activePanel) {
                const tabId = activePanel.id.replace('tab-', '');
                runCode(tabId);
            }
        }
    });
}

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initEditors();
    initExampleSelects();
    initKeyboard();
    initPyodide();
});
