/* ------------------------------------------------------------------
   Curated examples for each concept. Each example has a title,
   a short blurb, and the source code(s).
------------------------------------------------------------------- */
window.EXAMPLES = {
  duck: [
    {
      title: "Classic: anything that quacks is a duck",
      blurb: "No inheritance, no interfaces — just behavior.",
      explain: `Duck typing means Python checks an object's <b>capabilities</b>, not its class. The function <code>make_it_quack</code> works for any argument that has a <code>.quack()</code> method — even classes that share no ancestry.<br><br>
The Dog raises <code>AttributeError</code> at runtime: Python only realizes the mistake when it actually tries to look up <code>.quack()</code>. That's the trade-off for the flexibility.`,
      code: `# Duck typing: Python only cares whether an object can do
# what we ask, not what its class is.

class Duck:
    def quack(self):
        return "Quack!"

class Person:
    def quack(self):
        return "I'm pretending to be a duck."

class Dog:
    def bark(self):
        return "Woof!"

def make_it_quack(thing):
    # We don't check the type. We just call .quack().
    return thing.quack()

print(make_it_quack(Duck()))
print(make_it_quack(Person()))

# This will fail at runtime — Dog has no .quack() method.
try:
    print(make_it_quack(Dog()))
except AttributeError as e:
    print("Runtime error:", e)
`
    },
    {
      title: "File-like objects: works on anything with .read()",
      blurb: "The real-world version of duck typing.",
      code: `# Many Python APIs accept any "file-like" object — that just means
# something with a .read() method. No formal interface needed.

import io

class StringSource:
    """A custom 'file-like' object that yields a fixed message."""
    def __init__(self, msg):
        self._msg = msg
        self._read = False
    def read(self):
        if self._read:
            return ""
        self._read = True
        return self._msg

def count_words(file_like):
    text = file_like.read()
    return len(text.split())

# Real file-like (StringIO from stdlib)
print(count_words(io.StringIO("hello world from python")))

# Our custom duck — works just as well
print(count_words(StringSource("duck typing is wonderful for testing")))
`
    },
    {
      title: "EAFP — Easier to Ask Forgiveness than Permission",
      blurb: "Pythonic idiom that leans on duck typing.",
      code: `# Instead of checking types upfront (LBYL), Python encourages EAFP:
# just try the operation and handle exceptions if it fails.

def total_length(items):
    total = 0
    for item in items:
        try:
            total += len(item)        # works for str, list, tuple, dict, set...
        except TypeError:
            print(f"  ! skipping {item!r} (no len)")
    return total

mixed = ["hello", [1, 2, 3], (1, 2), {"a": 1, "b": 2}, 42, None, "duck"]
print("Total len:", total_length(mixed))
`
    },
    {
      title: "Iterables: __iter__ is all you need",
      blurb: "Custom collections plug right into for-loops.",
      code: `# Anything implementing __iter__ (or __getitem__) can be iterated.
# Python's for-loop doesn't care about your class hierarchy.

class CountDown:
    def __init__(self, start):
        self.start = start
    def __iter__(self):
        n = self.start
        while n > 0:
            yield n
            n -= 1

for n in CountDown(5):
    print(n, end=" ")
print()

# sum() also just needs an iterable of numbers.
print("Sum:", sum(CountDown(10)))
`
    }
  ],

  poly: [
    {
      title: "Subtype polymorphism: shapes",
      blurb: "Same .area() call, many implementations.",
      explain: `Subtype polymorphism: each subclass overrides <code>area()</code> with its own formula. The for-loop calls <code>s.area()</code> uniformly — Python dispatches to the correct implementation based on the actual type of <code>s</code>.<br><br>
This is the OOP-textbook flavor of polymorphism, and it's what most languages mean by the word.`,
      code: `import math

class Shape:
    def area(self):
        raise NotImplementedError

class Circle(Shape):
    def __init__(self, r): self.r = r
    def area(self): return math.pi * self.r ** 2

class Rectangle(Shape):
    def __init__(self, w, h): self.w, self.h = w, h
    def area(self): return self.w * self.h

class Triangle(Shape):
    def __init__(self, b, h): self.b, self.h = b, h
    def area(self): return 0.5 * self.b * self.h

shapes = [Circle(3), Rectangle(4, 5), Triangle(6, 2)]
for s in shapes:
    print(f"{type(s).__name__:9s} -> area = {s.area():.2f}")
`
    },
    {
      title: "Operator overloading (ad-hoc polymorphism)",
      blurb: "Make your class work with +, ==, len(), str()…",
      code: `# Dunder methods let your class behave like built-in types.

class Money:
    def __init__(self, amount, currency="USD"):
        self.amount = amount
        self.currency = currency

    def __add__(self, other):
        if self.currency != other.currency:
            raise ValueError("Cannot add different currencies")
        return Money(self.amount + other.amount, self.currency)

    def __eq__(self, other):
        return (self.amount, self.currency) == (other.amount, other.currency)

    def __repr__(self):
        return f"{self.amount:.2f} {self.currency}"

a = Money(10)
b = Money(5.5)
print("a + b =", a + b)
print("a == Money(10):", a == Money(10))
print("List of money:", [a, b, a + b])
`
    },
    {
      title: "Parametric polymorphism: generic functions",
      blurb: "One function, many input types — works because of duck typing.",
      code: `# A 'generic' function in Python — it works with anything that
# supports ordering and addition.

from typing import Iterable, TypeVar
T = TypeVar("T")

def smallest(items):
    it = iter(items)
    best = next(it)
    for x in it:
        if x < best:
            best = x
    return best

print(smallest([3, 1, 4, 1, 5, 9, 2, 6]))
print(smallest(["banana", "apple", "cherry"]))
print(smallest([(2, "b"), (1, "z"), (3, "a")]))
`
    },
    {
      title: "Polymorphism + duck typing combined",
      blurb: "A render() function for any 'drawable'.",
      code: `class Square:
    def __init__(self, size): self.size = size
    def draw(self): return "■" * self.size

class Line:
    def __init__(self, length): self.length = length
    def draw(self): return "─" * self.length

class Stars:
    def __init__(self, n): self.n = n
    def draw(self): return "★ " * self.n

def render(scene):
    for item in scene:
        print(item.draw())

scene = [Square(5), Line(12), Stars(4), Square(3)]
render(scene)
`
    }
  ],

  typing: [
    {
      title: "Type mismatch — when does it fail?",
      blurb: "Same logical bug; static catches it first.",
      python: `# Python: dynamically typed.
# The bug only shows up when the bad path actually runs.

def add(a, b):
    return a + b

print(add(2, 3))          # fine
print(add("hi ", "duck")) # fine — '+' is overloaded for strings
print(add(2, "duck"))     # BOOM at runtime
`,
      java: `// Java: statically typed.
// The compiler refuses to build this program at all.

public class Main {
    static int add(int a, int b) {
        return a + b;
    }

    public static void main(String[] args) {
        System.out.println(add(2, 3));
        System.out.println(add("hi ", "duck")); // ❌ compile error
        System.out.println(add(2, "duck"));     // ❌ compile error
    }
}
`,
      staticReport:
`✗ Main.java:9: error — incompatible types
    String cannot be converted to int
    System.out.println(add("hi ", "duck"));
                            ^
✗ Main.java:10: error — incompatible types
    String cannot be converted to int
    System.out.println(add(2, "duck"));
                                  ^
2 errors. Build failed before any code ran.`
    },
    {
      title: "Typo that runs anyway",
      blurb: "Dynamic languages can hide bugs in cold code paths.",
      python: `# This Python code has a typo (.upcase() instead of .upper()),
# but only the bad branch will fail — and only when it executes.

def shout(name, loud=True):
    if loud:
        return name.upcase() + "!"   # typo: should be .upper()
    return name + "."

print(shout("alice", loud=False))   # works! prints "alice."
print(shout("bob",   loud=True))    # crashes here at runtime
`,
      java: `// Java: the same typo is caught immediately by the compiler,
// regardless of which branch is taken at runtime.

public class Main {
    static String shout(String name, boolean loud) {
        if (loud) {
            return name.upcase() + "!"; // ❌ method does not exist
        }
        return name + ".";
    }

    public static void main(String[] args) {
        System.out.println(shout("alice", false));
        System.out.println(shout("bob",   true));
    }
}
`,
      staticReport:
`✗ Main.java:5: error — cannot find symbol
    symbol:   method upcase()
    location: variable name of type String
            return name.upcase() + "!";
                       ^
1 error. The typo is caught even before the branch is executed.`
    },
    {
      title: "Refactoring safety",
      blurb: "Rename a field in 50 places. Which language tells you?",
      python: `# Imagine you renamed user.name to user.full_name everywhere…
# except one place. Python won't notice until that line runs.

class User:
    def __init__(self, full_name):
        self.full_name = full_name

def greet(user):
    return f"Hello, {user.name}!"   # forgot to update this line

u = User("Ada Lovelace")

# Many tests pass that don't call greet()...
print("Created:", u.full_name)

# ...but production blows up the moment greet() is invoked.
print(greet(u))
`,
      java: `// Java's compiler immediately flags every stale reference.

public class Main {
    static class User {
        String fullName;
        User(String fullName) { this.fullName = fullName; }
    }

    static String greet(User user) {
        return "Hello, " + user.name + "!"; // ❌ no such field
    }

    public static void main(String[] args) {
        User u = new User("Ada Lovelace");
        System.out.println("Created: " + u.fullName);
        System.out.println(greet(u));
    }
}
`,
      staticReport:
`✗ Main.java:9: error — cannot find symbol
    symbol:   variable name
    location: variable user of type Main.User
            return "Hello, " + user.name + "!";
                                    ^
1 error. The refactor is incomplete — and the compiler proves it.`
    },
    {
      title: "Gradual typing: best of both worlds",
      blurb: "Python type hints + a checker like mypy.",
      python: `# Python now supports optional type hints. They don't change runtime
# behavior, but tools like mypy can check them statically — giving you
# Java-style safety without losing Python's flexibility.

from typing import List

def total(prices: List[float]) -> float:
    return sum(prices)

# At runtime, Python doesn't enforce hints — this still runs:
print(total([1.0, 2.5, 3.25]))   # ok
print(total(["oops", 1.0]))      # crashes at runtime; mypy would flag it

# Hints are a contract for your team and your tools, not a runtime guard.
`,
      java: `// In Java, types are not optional — they're the whole language.
// You get the same protection mypy provides for Python, but it's
// non-negotiable.

import java.util.List;

public class Main {
    static double total(List<Double> prices) {
        double sum = 0.0;
        for (double p : prices) sum += p;
        return sum;
    }

    public static void main(String[] args) {
        System.out.println(total(List.of(1.0, 2.5, 3.25)));
        // System.out.println(total(List.of("oops", 1.0))); // ❌ wouldn't compile
    }
}
`,
      staticReport:
`✓ No type errors detected.

Note: in Python you'd run \`mypy main.py\` to get the equivalent check.
mypy on the snippet to the left would report:
    main.py:10: error: List item 0 has incompatible type "str"; expected "float"`
    }
  ],

  /* ------------------------------------------------------------------
     Strong vs Weak Typing
  ------------------------------------------------------------------- */
  strength: [
    {
      title: "Python (strong) refuses silly conversions",
      blurb: "No implicit string ↔ number coercion.",
      python: `# Python is STRONGLY typed: it won't silently convert types
# behind your back.

x = "5"
y = 3

try:
    print(x + y)        # TypeError: cannot concatenate str and int
except TypeError as e:
    print("Refused:", e)

# You must convert explicitly:
print(int(x) + y)       # 8
print(x + str(y))       # "53"
`,
      js: `// JavaScript is WEAKLY typed: it will happily coerce values
// to make the operator "work", often surprising you.

let x = "5";
let y = 3;

console.log(x + y);   // "53"  (number coerced to string)
console.log(x - y);   // 2     (string coerced to number!)
console.log("5" * "2"); // 10  (both coerced)
console.log([] + {});  // "[object Object]"
console.log([] + []);  // ""
console.log(true + 1); // 2
`,
      report:
`Strong typing (Python)
  • '+' between str and int is an error.
  • You must call int() / str() / float() explicitly.
  • Bugs surface immediately at the offending line.

Weak typing (JavaScript)
  • '+' coerces ints to strings; '-' / '*' coerce strings to numbers.
  • [] + {} == "[object Object]" — surprising but legal.
  • Convenient for quick scripts; risky in large systems.`
    },
    {
      title: "Truthiness & comparison",
      blurb: "Strong typing keeps comparisons predictable.",
      python: `# Python compares values of different types with strict rules.
# == only returns True if values are 'equal' in a meaningful way.

print(1 == True)       # True (bool is a subclass of int)
print(1 == "1")        # False — different types, no coercion
print(0 == "")         # False
print([] == False)     # False

# Truthiness still exists, but it doesn't change ==.
print(bool([]))        # False
print(bool([0]))       # True
`,
      js: `// JavaScript has TWO equality operators because of weak typing:
//   ==  performs type coercion (loose equality)
//   === requires same type (strict equality)

console.log(1 == true);     // true  — coerced
console.log(1 == "1");      // true  — string coerced to number
console.log(0 == "");       // true  — both coerced to 0
console.log(0 == "0");      // true
console.log("" == "0");     // false — both strings, not equal

// Strict equality avoids the surprises:
console.log(1 === true);    // false
console.log(1 === "1");     // false
`,
      report:
`Take-away:
  • Strong typing → one equality operator with predictable rules.
  • Weak typing  → two operators, and you should almost always use ===.
  • The famous JS "wat" talks are mostly about weak-typing coercions.`
    },
    {
      title: "C: weakly typed AND statically typed",
      blurb: "Strong vs weak is independent of static vs dynamic.",
      python: `# Reminder: 'strong vs weak' and 'static vs dynamic' are different axes.
# Python is STRONG + DYNAMIC.
# JavaScript is WEAK + DYNAMIC.
# Java is STRONG + STATIC.
# C is famously WEAK + STATIC — it has compile-time types, but lets you
# bend them with casts and pointer tricks.

# We can model C-style "reinterpret these bytes" using the struct module:
import struct
raw = struct.pack("f", 3.14)        # store a float as 4 bytes
as_int = struct.unpack("I", raw)[0] # reinterpret those 4 bytes as int
print("3.14 reinterpreted as int:", as_int)
`,
      js: `/*  C example for comparison — does NOT run here.

    int    i = 65;
    char   c = (char) i;       // valid cast: 65 -> 'A'
    char  *p = (char*) &i;     // pointer-cast an int to char*
    printf("%c\\n", *p);        // depends on endianness

  C trusts you. Casts can lie about what the bytes mean,
  and the compiler won't stop you. That's weak typing on
  top of a static type system.
*/`,
      report:
`Two independent axes:

                    Strong            Weak
            ┌─────────────────┬────────────────────┐
   Static   │  Java, Rust     │  C, C++ (casts)    │
            ├─────────────────┼────────────────────┤
   Dynamic  │  Python, Ruby   │  JavaScript, PHP   │
            └─────────────────┴────────────────────┘

Strength = how strict the rules are about mixing types.
Static/dynamic = when those rules are checked.`
    }
  ],

  /* ------------------------------------------------------------------
     Inheritance
  ------------------------------------------------------------------- */
  inherit: [
    {
      title: "Single inheritance + super()",
      blurb: "Subclass extends a parent and reuses its behavior.",
      explain: `<code>Dog(Animal)</code> means Dog inherits from Animal: it gets <code>__init__</code>, <code>speak</code>, and any other Animal methods for free.<br><br>
<code>super().__init__(name)</code> calls the parent's initializer so we don't have to copy that code. <code>super().speak()</code> calls the parent's version of <code>speak</code> and we then extend its return value — that's <em>method extension</em> as opposed to total override.`,
      code: `class Animal:
    def __init__(self, name):
        self.name = name
    def speak(self):
        return f"{self.name} makes a sound."

class Dog(Animal):
    def __init__(self, name, breed):
        super().__init__(name)        # call parent's __init__
        self.breed = breed
    def speak(self):                  # override
        base = super().speak()        # extend parent's behavior
        return base + f" (Actually, woof! I'm a {self.breed}.)"

d = Dog("Rex", "Husky")
print(d.speak())
print("Is Dog an Animal?", isinstance(d, Animal))
`
    },
    {
      title: "Multi-level inheritance",
      blurb: "Chains of classes, each adding something.",
      code: `class Vehicle:
    def __init__(self, wheels): self.wheels = wheels
    def describe(self): return f"{self.wheels}-wheeled vehicle"

class Car(Vehicle):
    def __init__(self, brand):
        super().__init__(wheels=4)
        self.brand = brand
    def describe(self):
        return super().describe() + f", brand: {self.brand}"

class ElectricCar(Car):
    def __init__(self, brand, battery_kwh):
        super().__init__(brand)
        self.battery_kwh = battery_kwh
    def describe(self):
        return super().describe() + f", battery: {self.battery_kwh} kWh"

print(ElectricCar("Tesla", 75).describe())

# The MRO (Method Resolution Order) is how Python finds methods.
print("\\nMRO:", [c.__name__ for c in ElectricCar.__mro__])
`
    },
    {
      title: "Multiple inheritance & MRO",
      blurb: "Python uses the C3 linearization algorithm.",
      code: `class Swimmer:
    def move(self): return "swimming"

class Flyer:
    def move(self): return "flying"

class Duck(Swimmer, Flyer):
    """Inherits from BOTH. The leftmost parent wins by default."""
    pass

class Penguin(Swimmer, Flyer):
    def move(self):
        # Explicitly compose behaviors from both parents.
        return f"{Swimmer.move(self)} (but waddling on land)"

print("Duck    ->", Duck().move())
print("Penguin ->", Penguin().move())

# C3 MRO determines which parent is consulted first.
print("\\nDuck MRO:    ", [c.__name__ for c in Duck.__mro__])
print("Penguin MRO: ", [c.__name__ for c in Penguin.__mro__])
`
    },
    {
      title: "Abstract base classes",
      blurb: "Force subclasses to implement specific methods.",
      code: `from abc import ABC, abstractmethod

class PaymentMethod(ABC):
    @abstractmethod
    def charge(self, amount: float) -> str: ...

class CreditCard(PaymentMethod):
    def charge(self, amount):
        return f"Charged \${amount:.2f} to a credit card."

class PayPal(PaymentMethod):
    def charge(self, amount):
        return f"Charged \${amount:.2f} via PayPal."

# This one forgets to implement charge() — Python won't let us instantiate it.
class HalfBaked(PaymentMethod):
    pass

for cls in (CreditCard, PayPal):
    print(cls().charge(19.99))

try:
    HalfBaked()
except TypeError as e:
    print("Refused to instantiate HalfBaked:", e)
`
    },
    {
      title: "Composition vs inheritance",
      blurb: "Often, 'has-a' beats 'is-a'.",
      code: `# Inheritance is powerful but brittle. Composition (holding another
# object as a field) is usually more flexible.

# --- Inheritance approach ---
class LoggerBase:
    def log(self, msg): print(f"[LOG] {msg}")

class ServiceA(LoggerBase):
    def do_work(self):
        self.log("ServiceA working...")

# --- Composition approach ---
class Logger:
    def log(self, msg): print(f"[LOG] {msg}")

class ServiceB:
    def __init__(self, logger):
        self.logger = logger          # inject dependency
    def do_work(self):
        self.logger.log("ServiceB working...")

ServiceA().do_work()
ServiceB(Logger()).do_work()

# Composition lets us swap loggers (e.g. for tests) without touching
# the class hierarchy.
class SilentLogger:
    def log(self, msg): pass

ServiceB(SilentLogger()).do_work()    # no output — just runs silently
print("done")
`
    }
  ],

  /* ------------------------------------------------------------------
     Encapsulation
  ------------------------------------------------------------------- */
  encap: [
    {
      title: "Public, _protected, __private",
      blurb: "Python uses naming conventions, not access modifiers.",
      explain: `Python has no <code>private</code> keyword. Instead:<ul>
<li>No prefix → public.</li>
<li>Single underscore <code>_</code> → "internal", a convention.</li>
<li>Double underscore <code>__</code> → name mangling: the attribute is renamed to <code>_ClassName__name</code> at class-definition time, making it harder (but not impossible) to reach from outside.</li></ul>
The example proves both points: <code>_balance</code> is reachable, and <code>__pin</code> just gets renamed.`,
      code: `class Account:
    def __init__(self, owner, balance):
        self.owner = owner          # public
        self._balance = balance     # 'protected' by convention (don't touch from outside)
        self.__pin = "1234"         # 'private' — name-mangled

    def withdraw(self, amount, pin):
        if pin != self.__pin:
            raise ValueError("Bad PIN")
        if amount > self._balance:
            raise ValueError("Insufficient funds")
        self._balance -= amount
        return self._balance

a = Account("Ada", 100)
print(a.owner)              # public — fine
print(a._balance)            # accessible, but you're "trespassing"
# print(a.__pin)             # AttributeError — Python mangled the name

# Proof of name mangling:
print("Mangled name:", [n for n in dir(a) if "pin" in n])
print(a._Account__pin)       # the actual stored name (still reachable!)

print("New balance:", a.withdraw(40, "1234"))
`
    },
    {
      title: "Properties: getters/setters that look like attributes",
      blurb: "Add validation without breaking the public API.",
      code: `class Temperature:
    def __init__(self, celsius=0.0):
        self.celsius = celsius          # uses the setter below

    @property
    def celsius(self):
        return self._celsius

    @celsius.setter
    def celsius(self, value):
        if value < -273.15:
            raise ValueError("Below absolute zero!")
        self._celsius = value

    @property
    def fahrenheit(self):               # computed, read-only
        return self._celsius * 9/5 + 32

t = Temperature(25)
print("C:", t.celsius, "F:", t.fahrenheit)

t.celsius = 100                          # setter runs validation
print("C:", t.celsius, "F:", t.fahrenheit)

try:
    t.celsius = -500
except ValueError as e:
    print("Caught:", e)

try:
    t.fahrenheit = 451                   # no setter -> AttributeError
except AttributeError as e:
    print("Caught:", e)
`
    },
    {
      title: "Immutability with __slots__ + frozen dataclass",
      blurb: "Lock down what an object exposes.",
      code: `# __slots__ tells Python: this class has EXACTLY these attributes.
# It saves memory AND prevents typos like obj.naem = "..."

class Point:
    __slots__ = ("x", "y")
    def __init__(self, x, y):
        self.x, self.y = x, y

p = Point(1, 2)
try:
    p.z = 3                # __slots__ rejects unknown attributes
except AttributeError as e:
    print("Refused:", e)

# Frozen dataclasses combine __slots__-style discipline with immutability.
from dataclasses import dataclass

@dataclass(frozen=True)
class Coord:
    lat: float
    lon: float

c = Coord(40.7, -74.0)
print(c)
try:
    c.lat = 0.0            # immutable
except Exception as e:
    print("Refused:", type(e).__name__, "-", e)
`
    },
    {
      title: "Encapsulating invariants in a class",
      blurb: "The whole point: keep the data consistent.",
      code: `# A Stack should never let outsiders see/modify its internal list directly,
# otherwise invariants (like 'size always matches len(items)') can break.

class Stack:
    def __init__(self):
        self._items = []
        self._size = 0

    def push(self, x):
        self._items.append(x)
        self._size += 1

    def pop(self):
        if not self._items:
            raise IndexError("pop from empty stack")
        self._size -= 1
        return self._items.pop()

    @property
    def size(self):
        return self._size

s = Stack()
for n in (10, 20, 30):
    s.push(n)
print("size:", s.size)
print("pop ->", s.pop())
print("size:", s.size)

# If someone reaches inside and bypasses the methods…
s._items.append("oops")
print("Real length:", len(s._items), "but reported size:", s.size)
print("→ that's why encapsulation matters: invariants got broken.")
`
    }
  ]
};


/* ==================================================================
   Callback functions, Closures, Recursion, Generators
================================================================== */

window.EXAMPLES.cb = [
  {
    title: "Basic callback: pass a function as an argument",
    blurb: "The whole idea — one function calls another later.",
    explain: `A callback is just a regular function — what makes it "a callback" is the role it plays: someone <b>else</b> decides when to call it.<br><br>
In <code>run_for_each</code>, the loop has no idea what <code>callback</code> does; it just delegates. Swap <code>greet</code> for <code>shout</code> and the behavior changes without touching <code>run_for_each</code>. That's the power of higher-order functions.`,
    code: `# A "callback" is just a function passed as an argument.
# The receiver decides WHEN (and IF) to call it.

def greet(name):
    print(f"  -> hello, {name}!")

def shout(name):
    print(f"  -> HEY, {name.upper()}!")

def run_for_each(names, callback):
    for n in names:
        print(f"about to call callback for {n!r}")
        callback(n)             # the receiver invokes the callback
        print(f"finished {n!r}")

run_for_each(["ada", "linus"], greet)
print("--- swap callback ---")
run_for_each(["ada", "linus"], shout)
`
  },
  {
    title: "Higher-order helpers: map / filter",
    blurb: "Built-in higher-order functions are callbacks in disguise.",
    code: `# map() and filter() each take a callback that's applied per element.

def square(x):
    return x * x

def is_even(x):
    return x % 2 == 0

nums = [1, 2, 3, 4, 5, 6]
print("squared:", list(map(square, nums)))
print("even:   ", list(filter(is_even, nums)))

# Lambdas are anonymous callbacks — one-liners passed inline.
print("cubed:  ", list(map(lambda x: x ** 3, nums)))
print("> 3:    ", list(filter(lambda x: x > 3, nums)))
`
  },
  {
    title: "Event-style callbacks",
    blurb: "Register handlers, fire them later.",
    code: `# A miniature pub/sub system.
# Subscribers register callbacks; the publisher invokes them on each event.

class Button:
    def __init__(self, label):
        self.label = label
        self._handlers = []

    def on_click(self, fn):
        self._handlers.append(fn)
        print(f"[{self.label}] registered handler: {fn.__name__}")

    def click(self):
        print(f"[{self.label}] clicked! firing {len(self._handlers)} handler(s)")
        for fn in self._handlers:
            fn(self)

def log_it(btn):
    print(f"   • log: {btn.label} was clicked")

def confirm(btn):
    print(f"   • confirm: yes, you really clicked {btn.label}")

ok = Button("OK")
ok.on_click(log_it)
ok.on_click(confirm)
print("--- user clicks ---")
ok.click()
ok.click()
`
  },
  {
    title: "Callback with state via closure",
    blurb: "A callback that remembers something between calls.",
    code: `# A callback factory: returns a function that counts how many times
# it has been invoked. The counter lives in the enclosing scope.

def make_counter(name):
    count = 0
    def cb():
        nonlocal count
        count += 1
        print(f"   {name} invoked {count} time(s)")
    return cb

clicks = make_counter("click")
ticks  = make_counter("tick")

for _ in range(3):
    clicks()
ticks()
clicks()
ticks()
`
  },
];

window.EXAMPLES.closure = [
  {
    title: "Closure 101: inner function captures outer variable",
    blurb: "The inner function 'remembers' x even after make_adder returns.",
    explain: `When Python compiles <code>add</code>, it sees that <code>x</code> isn't local to <code>add</code>, so it captures it from the enclosing scope. The captured reference lives in <code>add.__closure__</code> as a "cell".<br><br>
Even after <code>make_adder</code> has returned and its local frame is gone, the cell keeps <code>x</code> alive. That's why <code>add5</code> still remembers 5 — the closure outlives its creator.`,
    code: `def make_adder(x):
    # 'x' is captured by the inner function.
    def add(y):
        return x + y           # 'x' comes from the enclosing scope
    return add

add5  = make_adder(5)
add10 = make_adder(10)

# add5 still 'remembers' x=5; add10 still 'remembers' x=10.
print("add5(3) =", add5(3))
print("add10(3) =", add10(3))
print("captured cells:", add5.__closure__[0].cell_contents,
                          add10.__closure__[0].cell_contents)
`
  },
  {
    title: "nonlocal: mutating a captured variable",
    blurb: "Without nonlocal, assignment creates a new local variable.",
    code: `# A closure that updates state across calls.

def make_counter(start=0):
    count = start
    def step(by=1):
        nonlocal count          # required to REASSIGN the outer name
        count += by
        return count
    return step

c = make_counter()
print(c())     # 1
print(c())     # 2
print(c(10))   # 12

# Without nonlocal, Python would treat 'count' as a new local on the
# left-hand side of '+=', and you'd get UnboundLocalError on first call.
`
  },
  {
    title: "Late-binding gotcha (the classic one)",
    blurb: "Closures capture VARIABLES, not snapshots of their values.",
    code: `# Famous beginner trap: all the lambdas below share the same 'i'.

bad = [lambda: i for i in range(3)]
print("bad: ", [f() for f in bad])    # [2, 2, 2] — they all see the final i

# Fix: bind the value at definition time using a default argument,
# which IS evaluated when the lambda is created.
good = [lambda i=i: i for i in range(3)]
print("good:", [f() for f in good])   # [0, 1, 2]
`
  },
  {
    title: "Closures as private state",
    blurb: "Like a tiny object — but built from functions.",
    code: `# A closure can act like an object with private fields.

def make_account(balance):
    def deposit(amount):
        nonlocal balance
        balance += amount
        return balance
    def withdraw(amount):
        nonlocal balance
        if amount > balance:
            raise ValueError("insufficient funds")
        balance -= amount
        return balance
    def get_balance():
        return balance
    return {
        "deposit": deposit,
        "withdraw": withdraw,
        "balance": get_balance,
    }

acc = make_account(100)
print("balance:", acc["balance"]())
print("after deposit 50:", acc["deposit"](50))
print("after withdraw 30:", acc["withdraw"](30))

# 'balance' is private — there's no way to reach it from outside
# except through the returned functions.
`
  },
  {
    title: "Decorator (closure-powered)",
    blurb: "A decorator IS a closure that wraps a function.",
    code: `# A decorator takes a function and returns a new function that
# 'remembers' the original via closure.

def trace(fn):
    def wrapper(*args, **kwargs):
        print(f"  -> calling {fn.__name__}{args}")
        result = fn(*args, **kwargs)
        print(f"  <- {fn.__name__} returned {result!r}")
        return result
    return wrapper

@trace
def add(a, b):
    return a + b

@trace
def greet(name):
    return f"hello, {name}"

print("=>", add(2, 3))
print("=>", greet("Ada"))
`
  },
];

window.EXAMPLES.recursion = [
  {
    title: "Factorial — the textbook example",
    blurb: "Each call shrinks n by 1 until the base case.",
    explain: `Two parts to any recursive function:<ul>
<li><b>Base case:</b> when to stop (here: <code>n &lt;= 1</code>).</li>
<li><b>Recursive case:</b> shrink the problem and recurse.</li></ul>
The Trace view makes the call stack visible: each call indents one level, then unwinds back as each one returns its result.`,
    code: `def factorial(n):
    if n <= 1:                # base case
        return 1
    return n * factorial(n - 1)   # recursive case

for i in range(1, 6):
    print(f"{i}! = {factorial(i)}")
`
  },
  {
    title: "Fibonacci — naive (exponential)",
    blurb: "Beautifully simple, painfully slow without memoization.",
    code: `def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

# Try larger values and watch the trace explode!
for i in range(8):
    print(f"fib({i}) = {fib(i)}")
`
  },
  {
    title: "Fibonacci — memoized (linear)",
    blurb: "Cache results to avoid recomputing the same call.",
    code: `from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

for i in (10, 20, 30, 50):
    print(f"fib({i}) = {fib(i)}")

print("\\ncache stats:", fib.cache_info())
`
  },
  {
    title: "Stack overflow demo",
    blurb: "Each recursive call adds a frame — too many = crash.",
    code: `# Python sets a recursion limit (default ~1000) to protect you
# from stack overflow.

import sys
print("recursion limit:", sys.getrecursionlimit())

def descend(n):
    return descend(n - 1) + 1     # never hits a base case

try:
    descend(0)
except RecursionError as e:
    print("caught:", e)

# You COULD raise the limit, but the right fix is usually to convert
# the recursion into a loop (or add a base case).
def descend_safe(n, max_depth):
    if n >= max_depth:
        return n
    return descend_safe(n + 1, max_depth)

print("descend_safe(0, 50) =", descend_safe(0, 50))
`
  },
  {
    title: "Tower of Hanoi — recursion shines",
    blurb: "A problem that's almost impossible to write iteratively.",
    code: `def hanoi(n, src, dst, aux):
    if n == 0:
        return
    hanoi(n - 1, src, aux, dst)              # move n-1 to spare peg
    print(f"move disk {n}: {src} -> {dst}")
    hanoi(n - 1, aux, dst, src)              # move them onto target

print("3 disks:")
hanoi(3, "A", "C", "B")
`
  },
];

window.EXAMPLES.gen = [
  {
    title: "yield 101 — pause-and-resume",
    blurb: "Each yield freezes the function until next() asks for more.",
    explain: `Calling a generator function <em>doesn't</em> run its body — it returns a generator object in a "paused at line 1" state. Only <code>next()</code> (or a <code>for</code> loop) actually resumes it, until the next <code>yield</code>.<br><br>
The function's local state — variables, position — is preserved between resumes, like a thread frozen in time.`,
    code: `def countdown(n):
    print("  generator created, no code has run yet")
    while n > 0:
        print(f"  about to yield {n}")
        yield n              # pauses here, returns n to caller
        print(f"  resumed after yielding {n}")
        n -= 1
    print("  generator exhausted")

g = countdown(3)             # nothing printed yet — lazy!
print("calling next() the first time:")
print("got:", next(g))
print("calling next() again:")
print("got:", next(g))
print("calling next() again:")
print("got:", next(g))
print("one more next() will raise StopIteration:")
try:
    next(g)
except StopIteration:
    print("StopIteration!")
`
  },
  {
    title: "Lazy infinite sequences",
    blurb: "Generators can produce values forever — only what you ask for is computed.",
    code: `# An infinite generator. We never store all values.

def naturals():
    n = 1
    while True:
        yield n
        n += 1

import itertools

# Take just the first 7 values.
first7 = list(itertools.islice(naturals(), 7))
print("first 7 naturals:", first7)

# Combine generators: squares of odd naturals, first 5.
def squares(g):
    for x in g:
        yield x * x

odd = (n for n in naturals() if n % 2 == 1)
print("first 5 odd squares:", list(itertools.islice(squares(odd), 5)))
`
  },
  {
    title: "for-loop = next() in disguise",
    blurb: "Iterating with 'for' is sugar for repeated next() calls.",
    code: `def steps():
    yield "first"
    yield "second"
    yield "third"

# These two loops are identical:

print("--- for-loop version ---")
for s in steps():
    print("got", s)

print("--- manual next() version ---")
g = steps()
while True:
    try:
        s = next(g)
    except StopIteration:
        break
    print("got", s)
`
  },
  {
    title: "Memory-friendly pipelines",
    blurb: "Chain generators to process streams without loading everything.",
    code: `# A 'pipeline' of generators — data flows through one element at a time.

def numbers(n):
    for i in range(1, n + 1):
        yield i

def only_even(src):
    for x in src:
        if x % 2 == 0:
            yield x

def squared(src):
    for x in src:
        yield x * x

pipeline = squared(only_even(numbers(10)))

# Nothing has actually been computed yet!
print("pipeline object:", pipeline)
print("pulling values...")
for v in pipeline:
    print(" ", v)

# Even with billions of inputs, peak memory stays tiny — only one
# value travels through the pipeline at a time.
`
  },
  {
    title: "Generator expression vs list comprehension",
    blurb: "Same syntax, very different memory profile.",
    code: `import sys

n = 10_000

# List comprehension: builds the whole list in memory.
lc  = [i * i for i in range(n)]
# Generator expression: produces values on demand.
gen = (i * i for i in range(n))

print("list size in bytes:", sys.getsizeof(lc))
print("generator size:    ", sys.getsizeof(gen))   # constant, tiny

# Both sum to the same value; only the generator avoids materializing
# the full list.
print("sum from list:     ", sum(lc))
print("sum from generator:", sum(i * i for i in range(n)))
`
  },
];


/* ==================================================================
   Mutable vs Immutable, Exceptions, Control Structures,
   Functions vs Procedures, Lambdas & Higher-Order
================================================================== */

window.EXAMPLES.mut = [
  {
    title: "id() reveals what's really happening",
    blurb: "Immutable types make a NEW object on change; mutable ones don't.",
    explain: `<b>Key insight:</b> Python's <code>id()</code> returns a number that uniquely identifies an object during its lifetime — think of it as the object's address.
<br><br>
For <b>immutable</b> types (str, int, tuple), every "modification" creates a brand-new object — the id changes.<br>
For <b>mutable</b> types (list, dict, set), the object stays put and its contents are edited in place — the id stays the same.
<br><br>
That's the entire mental model. Everything else (aliasing bugs, default argument traps, hashable vs unhashable) follows from it.`,
    code: `# Immutable: a new object is created every time
s = "hello"
print("s id:", id(s))
s = s + " world"     # NEW string, new id
print("s id:", id(s))

# Mutable: the same object is modified in place
lst = [1, 2, 3]
print("\\nlst id:", id(lst))
lst.append(4)        # SAME object, same id
print("lst id:", id(lst))

# Reassigning a list (vs mutating it) makes a new object
lst = lst + [5]
print("after reassign, lst id:", id(lst))
`
  },
  {
    title: "Aliasing surprise",
    blurb: "Two names pointing at the same mutable object.",
    explain: `When you assign one variable to another, you copy the <em>reference</em>, not the data.
<br><br>
For mutable objects this means both names see every change — a common source of bugs.<br>
For immutable objects, "modifying" rebinds the name to a new object, so the alias is unaffected.
<br><br>
Use <code>list.copy()</code>, <code>dict.copy()</code>, or <code>copy.deepcopy()</code> if you want an independent copy.`,
    code: `# Two names, one list — changes through one are seen via the other.
a = [1, 2, 3]
b = a                  # b is just another label for the same list
b.append(99)
print("a:", a)         # [1, 2, 3, 99]
print("b:", b)
print("same object?", a is b)

# Want a real copy? Be explicit:
c = a.copy()           # or list(a), or a[:]
c.append("only-in-c")
print("\\nafter c.append:")
print("a:", a)
print("c:", c)

# Immutable types don't suffer this:
x = "hi"
y = x
y = y + "!"            # rebinds y, x unchanged
print("\\nx:", x, " y:", y)
`
  },
  {
    title: "The mutable default argument trap",
    blurb: "A classic Python gotcha caused by mutability.",
    explain: `Default argument values are evaluated <b>once</b>, when the function is defined — not each time it's called.<br>
A mutable default (like <code>[]</code>) becomes shared state across every call that doesn't override it.
<br><br>
<b>Fix:</b> use <code>None</code> as the sentinel and create a fresh container inside the function body.`,
    code: `# Buggy version — bag is created ONCE and shared!
def add_item_bad(item, bag=[]):
    bag.append(item)
    return bag

print(add_item_bad("apple"))    # ['apple']
print(add_item_bad("banana"))   # ['apple', 'banana']  <-- surprise!

# Correct version
def add_item(item, bag=None):
    if bag is None:
        bag = []
    bag.append(item)
    return bag

print("\\nfixed:")
print(add_item("apple"))
print(add_item("banana"))
`
  },
  {
    title: "Tour of the built-in containers",
    blurb: "str, tuple — immutable. list, dict, set — mutable.",
    explain: `Quick reference:
<ul>
<li><b>str</b> — immutable. Concatenation builds a new string.</li>
<li><b>tuple</b> — immutable. Use it as a dict key or set element.</li>
<li><b>list</b> — mutable. Ordered, indexable, supports append/pop.</li>
<li><b>dict</b> — mutable. Key-value pairs, fast lookup.</li>
<li><b>set</b> — mutable. Unordered, unique elements.</li>
</ul>
Only immutable values are <em>hashable</em> — that's why a tuple of strings can be a dict key but a list cannot.`,
    code: `# Each container behaves differently when you "change" it.

s = "hello"
t = (1, 2, 3)
l = [1, 2, 3]
d = {"a": 1}
st = {1, 2, 3}

print("BEFORE")
for name, obj in [("s", s), ("t", t), ("l", l), ("d", d), ("set", st)]:
    print(f"  {name}: id={id(obj)} value={obj!r}")

# Try to "change" each one
try:
    s[0] = "H"          # TypeError — strings are immutable
except TypeError as e:
    print("\\n  string refused:", e)

try:
    t[0] = 99           # TypeError — tuples are immutable
except TypeError as e:
    print("  tuple refused:", e)

l.append(4)             # ok
d["b"] = 2              # ok
st.add(4)               # ok

print("\\nAFTER (mutables only)")
for name, obj in [("l", l), ("d", d), ("set", st)]:
    print(f"  {name}: id={id(obj)} value={obj!r}")

# Hashability flows from immutability
print("\\nhashable?")
for v in ["hi", (1,2), [1,2], {"a":1}, {1,2}]:
    try:
        hash(v); print(f"  {v!r:20s} ✓")
    except TypeError:
        print(f"  {v!r:20s} ✗")
`
  },
  {
    title: "Tuple of mutable items",
    blurb: "An immutable container can hold mutable contents!",
    explain: `Immutability is <em>shallow</em>. A tuple's bindings can't change — you can't replace its elements — but if those elements are themselves mutable (like lists), they can still be modified.
<br><br>
This is why <code>([1,2], 3)</code> is <em>not</em> hashable: although the tuple is immutable, one of its elements isn't.`,
    code: `t = ([1, 2], "fixed", [3, 4])
print("before:", t)
print("id(t):", id(t))

# We can't replace the slots...
try:
    t[0] = "new"
except TypeError as e:
    print("refused:", e)

# ...but the lists inside are still mutable!
t[0].append(99)
t[2].append(100)
print("after:", t)
print("id(t):", id(t), "(unchanged)")

# That's why this tuple can't be used as a dict key:
try:
    {t: "value"}
except TypeError as e:
    print("\\nhash failed:", e)
`
  },
];

window.EXAMPLES.exc = [
  {
    title: "try / except / finally — the basics",
    blurb: "Catch errors, recover, always clean up.",
    explain: `Three blocks, three jobs:
<ul>
<li><b>try</b> — code that might fail.</li>
<li><b>except</b> — handle a specific exception type.</li>
<li><b>finally</b> — always runs, whether the try succeeded or not. Perfect for releasing resources.</li>
</ul>
The trace makes the flow visible: a successful run hits try → finally; a failed run hits try → except → finally.`,
    code: `def divide(a, b):
    try:
        print(f"  trying {a} / {b}")
        result = a / b
        print(f"  succeeded with {result}")
        return result
    except ZeroDivisionError as e:
        print(f"  caught: {e}")
        return None
    finally:
        print("  finally always runs")

print("--- normal call ---")
divide(10, 2)
print("\\n--- error call ---")
divide(10, 0)
`
  },
  {
    title: "Multiple except branches",
    blurb: "Handle different errors differently.",
    explain: `Python checks except clauses in order, top to bottom. The first one that matches the raised exception type runs.
<br><br>
Best practice:
<ul>
<li>Catch <b>specific</b> exceptions first (most specific → most general).</li>
<li>Don't use a bare <code>except:</code> unless you really mean "any error including KeyboardInterrupt".</li>
<li>Catching <code>Exception</code> covers most app-level errors but lets system exits through.</li>
</ul>`,
    code: `def parse_then_divide(s, n):
    try:
        x = int(s)
        return x / n
    except ValueError:
        print(f"  '{s}' is not a number")
    except ZeroDivisionError:
        print(f"  cannot divide by zero")
    except Exception as e:                # catch-all (rarely needed)
        print(f"  unexpected: {type(e).__name__}: {e}")

parse_then_divide("42", 2)
parse_then_divide("abc", 2)
parse_then_divide("10", 0)
parse_then_divide([1, 2], 1)              # totally unexpected
`
  },
  {
    title: "Raising your own exceptions",
    blurb: "Validate inputs early, fail loudly.",
    explain: `Use <code>raise</code> to signal an error from your own code. Either re-raise a built-in exception or define a custom subclass for domain-specific errors.
<br><br>
A good exception <b>has a clear name</b>, <b>carries useful context</b>, and <b>preserves the original cause</b> when wrapping (using <code>raise ... from e</code>).`,
    code: `class WithdrawalError(Exception):
    """Raised when a withdrawal can't go through."""

class InsufficientFunds(WithdrawalError):
    pass

def withdraw(balance, amount):
    if amount <= 0:
        raise ValueError(f"amount must be positive, got {amount}")
    if amount > balance:
        raise InsufficientFunds(f"balance {balance} < amount {amount}")
    return balance - amount

# Try several scenarios
for bal, amt in [(100, 30), (100, -5), (50, 80)]:
    try:
        new_bal = withdraw(bal, amt)
        print(f"  ok: balance now {new_bal}")
    except WithdrawalError as e:
        print(f"  withdrawal blocked: {e}")
    except ValueError as e:
        print(f"  bad input: {e}")
`
  },
  {
    title: "else clause + chained exceptions",
    blurb: "Less-known features that make handling cleaner.",
    explain: `Two extras:
<ul>
<li><code>else:</code> runs only when the try block did NOT raise. Useful to keep the "happy path" code out of the try block.</li>
<li><code>raise NewError(...) from original</code> preserves the chain. The traceback shows both.</li>
</ul>`,
    code: `def safe_int(s):
    try:
        n = int(s)
    except ValueError as e:
        # Re-raise as our own type but keep the original cause.
        raise RuntimeError(f"cannot convert {s!r}") from e
    else:
        # Only runs if int() didn't raise
        print(f"  parsed {s!r} -> {n}")
        return n

print(safe_int("42"))

try:
    safe_int("oops")
except RuntimeError as e:
    print(f"\\ncaught: {e}")
    print(f"caused by: {e.__cause__!r}")
`
  },
  {
    title: "Resource cleanup — finally vs with",
    blurb: "Two ways to guarantee cleanup runs.",
    explain: `<b>finally</b> works for any cleanup code.<br>
<b>with</b> blocks (context managers) are the cleaner alternative when an object knows how to clean itself up — files, locks, DB connections.
<br><br>
Both guarantee cleanup even if the body raises.`,
    code: `class Connection:
    def __init__(self, host):
        self.host = host
        print(f"  [open]  connection to {host}")
    def query(self, q):
        if "BAD" in q:
            raise RuntimeError("query failed")
        return f"result of {q!r}"
    def close(self):
        print(f"  [close] {self.host}")

# --- finally version ---
def with_finally(host, q):
    conn = Connection(host)
    try:
        return conn.query(q)
    finally:
        conn.close()

# --- with-block version (much nicer) ---
from contextlib import contextmanager

@contextmanager
def open_connection(host):
    conn = Connection(host)
    try:
        yield conn
    finally:
        conn.close()

print("--- using finally ---")
try:
    print(with_finally("db1", "BAD QUERY"))
except RuntimeError as e:
    print("  caught:", e)

print("\\n--- using a with-block ---")
try:
    with open_connection("db1") as c:
        print(c.query("BAD QUERY"))
except RuntimeError as e:
    print("  caught:", e)
`
  },
];

window.EXAMPLES.ctrl = [
  {
    title: "if / elif / else",
    blurb: "Conditional branching.",
    explain: `Python evaluates each branch top to bottom. The first <code>True</code> condition wins; the others are skipped.<br>
<code>else</code> is the fallback for "none of the above".
<br><br>
The <b>🔍 Trace</b> button shows clearly which branch was entered for each input.`,
    code: `def grade(score):
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    elif score >= 70:
        return "C"
    elif score >= 60:
        return "D"
    else:
        return "F"

for s in [95, 82, 71, 65, 40]:
    print(f"score {s} -> grade {grade(s)}")
`
  },
  {
    title: "for loop with iterables",
    blurb: "Iterate over anything iterable.",
    explain: `<code>for</code> in Python is a <em>foreach</em>: it walks any iterable — lists, tuples, strings, dicts, ranges, file objects, generators…
<br><br>
Use <code>enumerate()</code> when you need the index. Use <code>zip()</code> to iterate two iterables in parallel.`,
    code: `# Range
for i in range(5):
    print(f"i={i}")

# List with index
words = ["red", "green", "blue"]
print()
for idx, w in enumerate(words, start=1):
    print(f"{idx}. {w}")

# Two iterables in parallel
print()
prices = [1.99, 2.49, 0.99]
for w, p in zip(words, prices):
    print(f"{w:5s} -> ${p}")

# Dict iterates over keys; .items() gives both
print()
inventory = {"apples": 3, "pears": 5}
for k, v in inventory.items():
    print(f"{k}: {v}")
`
  },
  {
    title: "while loop with break",
    blurb: "Loop until a condition fails — or break out early.",
    explain: `<code>while</code> repeats while a condition is true.<br>
<code>break</code> exits the loop immediately.<br>
<code>continue</code> skips to the next iteration.
<br><br>
A while loop is the right tool when the number of iterations isn't known in advance.`,
    code: `# Find the first power of 2 above 1000
n = 1
while True:
    n *= 2
    if n > 1000:
        break
print("first power of 2 above 1000 is", n)

# while/else: the else runs only if the loop ended without break
target = 7
nums = [1, 3, 5, 9]
i = 0
while i < len(nums):
    if nums[i] == target:
        print("found at", i)
        break
    i += 1
else:
    print(f"{target} not found in {nums}")
`
  },
  {
    title: "break, continue, pass",
    blurb: "Three small statements with very different jobs.",
    explain: `<ul>
<li><b>break</b> — exit the loop right now.</li>
<li><b>continue</b> — skip the rest of this iteration, jump to the next one.</li>
<li><b>pass</b> — do absolutely nothing (a placeholder).</li>
</ul>
<code>pass</code> is useful when syntax requires a body but you have nothing to do (yet) — empty function or class definitions, for example.`,
    code: `# break: stop on first negative number
nums = [3, 7, 2, -1, 9]
for n in nums:
    if n < 0:
        print("found negative, stopping")
        break
    print("ok:", n)

# continue: skip even numbers
print()
for n in range(10):
    if n % 2 == 0:
        continue
    print("odd:", n)

# pass: a placeholder body
def todo_later():
    pass               # syntactically need a body

class Empty:
    pass

todo_later()
print("Empty instance:", Empty())
`
  },
  {
    title: "Nested loops + match (Python 3.10+)",
    blurb: "Loops inside loops, plus structural pattern matching.",
    explain: `Nested loops are fine — but watch out for performance (the work multiplies).<br>
<br>
<b>match</b> (Python 3.10+) is more powerful than <code>switch</code> in most languages: it can deconstruct tuples, dicts, and class instances.`,
    code: `# Nested: multiplication table
for i in range(1, 4):
    for j in range(1, 4):
        print(f"{i*j:>3}", end="")
    print()

# match — structural pattern matching
def describe(point):
    match point:
        case (0, 0):
            return "origin"
        case (x, 0):
            return f"on the x axis at {x}"
        case (0, y):
            return f"on the y axis at {y}"
        case (x, y) if x == y:
            return f"on the diagonal at {x}"
        case (x, y):
            return f"at ({x}, {y})"

print()
for p in [(0, 0), (3, 0), (0, -2), (4, 4), (1, 5)]:
    print(p, "->", describe(p))
`
  },
];

window.EXAMPLES.fn = [
  {
    title: "Function vs procedure",
    blurb: "A function returns a value; a procedure performs an action.",
    explain: `In Python, both are written with <code>def</code>. The distinction is conventional:
<ul>
<li>A <b>function</b> computes and <em>returns</em> a value, with no side effects ideally.</li>
<li>A <b>procedure</b> performs an action (printing, mutating, I/O) and returns nothing meaningful (Python returns <code>None</code>).</li>
</ul>
Functions compose; procedures coordinate. Mixing the two in one routine often signals a refactor opportunity.`,
    code: `# function: takes inputs, returns output, no side effects
def square(x):
    return x * x

# procedure: performs an action, returns None
def announce(name):
    print(f"Hello, {name}!")
    # implicit return None

print("function result:", square(5))

ret = announce("Ada")
print("procedure return value:", ret)

# Functions compose; procedures usually don't
print("composition:", square(square(3)))   # 81
`
  },
  {
    title: "Positional, keyword, default args",
    blurb: "All the ways you can pass arguments.",
    explain: `Python has flexible argument passing:
<ul>
<li><b>Positional</b>: matched by order.</li>
<li><b>Keyword</b>: matched by name.</li>
<li><b>Default</b>: optional, used when caller doesn't supply it.</li>
<li><b>*args</b>: collects extra positional args into a tuple.</li>
<li><b>**kwargs</b>: collects extra keyword args into a dict.</li>
</ul>`,
    code: `def greet(name, greeting="Hello", *args, punct="!", **kwargs):
    print(f"{greeting}, {name}{punct}")
    if args:
        print("  extra positional:", args)
    if kwargs:
        print("  extra keyword:   ", kwargs)

greet("Ada")
greet("Linus", "Hi")
greet("Grace", "Hey", "and", "friends", punct="?", role="admiral")
`
  },
  {
    title: "Pass-by-object-reference",
    blurb: "Python is neither pass-by-value nor pass-by-reference.",
    explain: `Python passes <em>references</em> to objects. The catch:
<ul>
<li>If you mutate the object inside the function, the caller sees the change.</li>
<li>If you reassign the parameter to a new object, only the local name changes.</li>
</ul>
This is why mutable defaults are dangerous, and why lists "leak" changes but integers don't.`,
    code: `def mutate(lst):
    lst.append(99)               # mutates caller's list
    print("  inside:", lst)

def reassign(lst):
    lst = [42]                   # only rebinds the local name
    print("  inside:", lst)

xs = [1, 2, 3]
mutate(xs)
print("after mutate:", xs)       # [1, 2, 3, 99]

ys = [1, 2, 3]
reassign(ys)
print("after reassign:", ys)     # unchanged
`
  },
  {
    title: "Multiple return values via tuple",
    blurb: "Python doesn't really 'return multiple' — it returns a tuple.",
    explain: `When you write <code>return a, b</code> Python packs them into a tuple. The caller can unpack it on the left-hand side.
<br><br>
This makes returning structured results trivial — and combined with <code>NamedTuple</code> or <code>@dataclass</code>, you get type-safe records.`,
    code: `def stats(nums):
    return min(nums), max(nums), sum(nums) / len(nums)

lo, hi, avg = stats([3, 1, 4, 1, 5, 9, 2, 6])
print(f"min={lo}, max={hi}, avg={avg:.2f}")

# Returning a NamedTuple gives the result names
from typing import NamedTuple
class Stats(NamedTuple):
    lo: int
    hi: int
    avg: float

def stats2(nums):
    return Stats(min(nums), max(nums), sum(nums) / len(nums))

s = stats2([10, 20, 30])
print(s)
print("avg only:", s.avg)
`
  },
  {
    title: "Reusable subroutines",
    blurb: "Compose small functions into a pipeline.",
    explain: `The point of functions: avoid duplication, make code testable, and let you build bigger features by composing smaller ones.<br>
A good function does <em>one thing</em>, takes a few inputs, and is easy to name.`,
    code: `# Tiny reusable subroutines
def normalize(text):
    return text.strip().lower()

def tokenize(text):
    return text.split()

def remove_short(words, min_len=3):
    return [w for w in words if len(w) >= min_len]

def word_count(text):
    return {w: text.split().count(w) for w in set(text.split())}

# Compose them into a pipeline
def analyze(text):
    text = normalize(text)
    words = remove_short(tokenize(text))
    return word_count(" ".join(words))

print(analyze("The quick brown fox jumps over the lazy dog the the"))
`
  },
];

window.EXAMPLES.lam = [
  {
    title: "lambda vs def",
    blurb: "Same idea, different syntax.",
    explain: `<code>lambda</code> creates a small anonymous function — limited to a single expression. Use it where naming feels overkill.
<br><br>
For anything multi-line, with statements, or that you'll reuse, use <code>def</code>.<br>
Both produce a function object; the only real difference is that <code>def</code> binds it to a name.`,
    code: `# def version
def square(x):
    return x * x

# lambda version
square2 = lambda x: x * x

print(square(5), square2(5))
print(type(square), type(square2))

# Lambdas shine inline as one-off callbacks
nums = [1, 2, 3, 4, 5]
print("doubled:", list(map(lambda x: x * 2, nums)))
`
  },
  {
    title: "map(), filter(), and reduce()",
    blurb: "The classic higher-order trio.",
    explain: `<ul>
<li><b>map(f, xs)</b> — apply f to each element, return iterator of results.</li>
<li><b>filter(pred, xs)</b> — keep elements where pred(x) is truthy.</li>
<li><b>reduce(f, xs[, init])</b> — fold a 2-arg function over the sequence.</li>
</ul>
In modern Python, list comprehensions and generator expressions are usually preferred over <code>map</code>/<code>filter</code>, but they remain useful when passing functions around.`,
    code: `from functools import reduce

nums = [1, 2, 3, 4, 5, 6]

print("squares:", list(map(lambda x: x**2, nums)))
print("evens:  ", list(filter(lambda x: x % 2 == 0, nums)))
print("sum:    ", reduce(lambda a, b: a + b, nums, 0))
print("product:", reduce(lambda a, b: a * b, nums, 1))

# Equivalent comprehension versions (often preferred)
print("\\ncomprehension equivalents:")
print("squares:", [x**2 for x in nums])
print("evens:  ", [x for x in nums if x % 2 == 0])
`
  },
  {
    title: "sorted() with a key function",
    blurb: "Custom sort orders are just one lambda away.",
    explain: `<code>sorted()</code> takes an optional <code>key=</code> callable that maps each item to the value to sort by.<br>
<code>reverse=True</code> flips the order.
<br><br>
The same <code>key=</code> argument works for <code>min()</code>, <code>max()</code>, <code>list.sort()</code>, and <code>heapq</code>.`,
    code: `people = [
    {"name": "Ada",   "age": 36},
    {"name": "Linus", "age": 54},
    {"name": "Grace", "age": 85},
    {"name": "Tim",   "age": 68},
]

# Sort by age
print("by age:")
for p in sorted(people, key=lambda p: p["age"]):
    print(" ", p)

# Sort by name length (shortest first), tiebreak by name
print("\\nby (len, name):")
for p in sorted(people, key=lambda p: (len(p["name"]), p["name"])):
    print(" ", p)

# Reverse alphabetical
print("\\nname desc:")
for p in sorted(people, key=lambda p: p["name"], reverse=True):
    print(" ", p)
`
  },
  {
    title: "Functions as first-class values",
    blurb: "Pass functions, store them, return them.",
    explain: `In Python, functions are <b>first-class</b>: you can put them in lists, pass them to other functions, and return them from functions. That's what makes higher-order programming possible.`,
    code: `# A dispatch table — looks up the right function by name
def add(a, b): return a + b
def sub(a, b): return a - b
def mul(a, b): return a * b

ops = {"+": add, "-": sub, "*": mul}

for op in "+-*":
    print(f"3 {op} 4 = {ops[op](3, 4)}")

# A function that returns a function (callback factory)
def power_of(n):
    return lambda x: x ** n

cube = power_of(3)
print("\\ncube(4) =", cube(4))
`
  },
  {
    title: "operator + functools — pro tools",
    blurb: "Skip lambdas with built-in helpers.",
    explain: `Two stdlib modules pair perfectly with higher-order functions:
<ul>
<li><b>operator</b> — pre-made callables for <code>+</code>, <code>*</code>, <code>itemgetter</code>, <code>attrgetter</code>, etc.</li>
<li><b>functools</b> — <code>reduce</code>, <code>partial</code>, <code>lru_cache</code>, <code>singledispatch</code>.</li>
</ul>
Using them is faster <em>and</em> often more readable than writing the equivalent lambda.`,
    code: `from operator import itemgetter, attrgetter, mul
from functools import reduce, partial

# itemgetter as a clean key= for sorted
people = [{"name": "Ada", "age": 36}, {"name": "Linus", "age": 54}]
print(sorted(people, key=itemgetter("age")))

# reduce with operator.mul == math.prod
print("product:", reduce(mul, [1, 2, 3, 4, 5]))

# partial — pre-fill arguments to make a new function
def power(base, exp):
    return base ** exp

square = partial(power, exp=2)
cube   = partial(power, exp=3)
print("square(7):", square(7))
print("cube(4):  ", cube(4))
`
  },
];
