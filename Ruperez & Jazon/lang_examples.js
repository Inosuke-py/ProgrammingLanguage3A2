/* ==================================================================
   Multi-language examples for each lab tab.
   Python lives in EXAMPLES.<tab> (separate file).
   This file holds the code + simulated output for Ruby, C, C++, JS.
================================================================== */
window.LANG_EXAMPLES = {

  /* ============================ DUCK TYPING ============================ */
  duck: {
    ruby: [
      {
        title: "Ruby — duck typing is the language motto",
        blurb: "Ruby coined the phrase 'if it quacks like a duck...'",
        explain: `Ruby is dynamically typed and famously embraces duck typing. There's no <code>interface</code> keyword and no need for inheritance — any object that responds to <code>quack</code> is a duck.<br><br>
The <code>respond_to?</code> method lets you ask the object directly whether it has a method, which is the Ruby idiom equivalent of Python's <code>hasattr</code>.`,
        code: `class Duck
  def quack; "Quack!"; end
end

class Person
  def quack; "I'm pretending to be a duck."; end
end

class Dog
  def bark; "Woof!"; end
end

def make_it_quack(thing)
  thing.quack
end

puts make_it_quack(Duck.new)
puts make_it_quack(Person.new)

begin
  puts make_it_quack(Dog.new)
rescue NoMethodError => e
  puts "Runtime error: #{e.message}"
end`,
        output: `Quack!
I'm pretending to be a duck.
Runtime error: undefined method 'quack' for an instance of Dog`
      },
      {
        title: "Ruby — respond_to? for graceful guards",
        blurb: "Idiomatic 'duck check' before calling.",
        explain: `Calling a method on an object that doesn't have it raises <code>NoMethodError</code>. To check first, use <code>respond_to?</code>. It's the Ruby equivalent of Python's <code>hasattr</code> or the "EAFP vs LBYL" debate.`,
        code: `class Duck
  def quack; "Quack!"; end
end

class Dog
  def bark; "Woof!"; end
end

[Duck.new, Dog.new].each do |thing|
  if thing.respond_to?(:quack)
    puts thing.quack
  else
    puts "#{thing.class} can't quack"
  end
end`,
        output: `Quack!
Dog can't quack`
      }
    ],
    c: [
      {
        title: "C — function pointers fake duck typing",
        blurb: "Bundle a 'quack' function pointer in every struct.",
        explain: `C has no objects, no classes — but a struct with function pointers gives a similar effect. Each instance carries its own <code>quack</code> implementation, and the caller invokes it generically.`,
        code: `#include <stdio.h>

typedef struct {
    const char *(*quack)(void);
} Quackable;

static const char *duck_quack(void)   { return "Quack!"; }
static const char *person_quack(void) { return "I'm pretending."; }

static void make_it_quack(Quackable q) {
    printf("%s\\n", q.quack());
}

int main(void) {
    Quackable duck   = { .quack = duck_quack };
    Quackable person = { .quack = person_quack };
    make_it_quack(duck);
    make_it_quack(person);
    return 0;
}`,
        output: `Quack!
I'm pretending.`
      }
    ],
    cpp: [
      {
        title: "C++ — runnable: structs with a quack() method",
        blurb: "Live in-browser C++ via JSCPP.",
        explain: `This example runs live in the browser using <b>JSCPP</b>, a JavaScript-based C++ interpreter. JSCPP supports a useful subset (iostream, vectors, classes, basic templates) but not modern features like C++20 concepts or coroutines.`,
        code: `#include <iostream>
#include <string>
using namespace std;

struct Duck   { string quack() { return "Quack!"; } };
struct Person { string quack() { return "I'm pretending to be a duck."; } };

int main() {
    Duck   d;
    Person p;
    cout << d.quack() << endl;
    cout << p.quack() << endl;
    return 0;
}`,
        output: `Quack!
I'm pretending to be a duck.`
      },
      {
        title: "C++ templates — compile-time duck typing",
        blurb: "If T has .quack(), it compiles.",
        explain: `Templates accept any type that <em>structurally</em> supports the operations used inside the template body. That's effectively compile-time duck typing — Python-like flexibility, but errors land at compile time.`,
        code: `#include <iostream>
#include <string>
using namespace std;

struct Duck   { string quack() { return "Quack!"; } };
struct Person { string quack() { return "I'm pretending to be a duck."; } };

template<typename T>
void make_it_quack(T thing) {
    cout << thing.quack() << endl;
}

int main() {
    make_it_quack(Duck{});
    make_it_quack(Person{});
    return 0;
}`,
        output: `Quack!
I'm pretending to be a duck.`
      }
    ],
    js: [
      {
        title: "JavaScript — duck typing native, just like Python",
        blurb: "Same idea, almost identical code.",
        explain: `JavaScript is dynamically typed and structurally checked at the call site, so duck typing falls out for free.`,
        code: `class Duck   { quack() { return "Quack!"; } }
class Person { quack() { return "I'm pretending."; } }
class Dog    { bark()  { return "Woof!"; } }

function makeItQuack(thing) {
    return thing.quack();
}

console.log(makeItQuack(new Duck()));
console.log(makeItQuack(new Person()));

try {
    console.log(makeItQuack(new Dog()));
} catch (e) {
    console.log("Runtime error:", e.message);
}`,
        output: `Quack!
I'm pretending.
Runtime error: thing.quack is not a function`,
        trace: [
          { kind: "call",   depth: 1, name: "makeItQuack", args: { thing: "Duck {}" } },
          { kind: "call",   depth: 2, name: "Duck.quack" },
          { kind: "return", depth: 2, name: "Duck.quack", value: '"Quack!"' },
          { kind: "return", depth: 1, name: "makeItQuack", value: '"Quack!"' },
          { kind: "print",  depth: 0, text: "Quack!" },
          { kind: "call",   depth: 1, name: "makeItQuack", args: { thing: "Person {}" } },
          { kind: "call",   depth: 2, name: "Person.quack" },
          { kind: "return", depth: 2, name: "Person.quack", value: '"I\'m pretending."' },
          { kind: "return", depth: 1, name: "makeItQuack", value: '"I\'m pretending."' },
          { kind: "print",  depth: 0, text: "I'm pretending." },
          { kind: "call",   depth: 1, name: "makeItQuack", args: { thing: "Dog {}" } },
          { kind: "error",  depth: 1, name: "makeItQuack", message: "TypeError: thing.quack is not a function" },
          { kind: "print",  depth: 0, text: "Runtime error: thing.quack is not a function" }
        ]
      }
    ]
  },

  /* ============================ POLYMORPHISM ============================ */
  poly: {
    ruby: [
      {
        title: "Ruby — every method call is virtual",
        blurb: "Subclass overrides win automatically.",
        explain: `Method dispatch in Ruby is always virtual; there's no <code>virtual</code> keyword. Combined with duck typing, polymorphism becomes nearly invisible — it's just how methods work.`,
        code: `class Shape
  def area; raise NotImplementedError; end
end

class Circle < Shape
  def initialize(r); @r = r; end
  def area; Math::PI * @r ** 2; end
end

class Rectangle < Shape
  def initialize(w, h); @w, @h = w, h; end
  def area; @w * @h; end
end

[Circle.new(3), Rectangle.new(4, 5)].each do |s|
  printf("%-10s -> %.2f\\n", s.class, s.area)
end`,
        output: `Circle     -> 28.27
Rectangle  -> 20.00`
      },
      {
        title: "Ruby operator overloading",
        blurb: "Define + or == like any other method.",
        explain: `In Ruby, operators are just methods with special names. Define <code>+</code> on a class and instances support <code>a + b</code>. <code>&lt;=&gt;</code> plus <code>include Comparable</code> gives all comparison operators for free.`,
        code: `class Money
  attr_reader :amount, :currency
  def initialize(amount, currency = "USD")
    @amount, @currency = amount, currency
  end
  def +(other)
    raise "currency mismatch" if currency != other.currency
    Money.new(amount + other.amount, currency)
  end
  def to_s
    format("%.2f %s", amount, currency)
  end
end

a = Money.new(10)
b = Money.new(5.5)
puts "a + b = #{a + b}"`,
        output: `a + b = 15.50 USD`
      }
    ],
    c: [
      {
        title: "C — vtables built by hand",
        blurb: "Function pointers in a struct = manual polymorphism.",
        explain: `C has no virtual methods. To get polymorphism, embed a function pointer in your struct and dispatch through it.`,
        code: `#include <stdio.h>
#include <math.h>

typedef struct Shape Shape;
struct Shape { double (*area)(Shape *); };

typedef struct { Shape base; double r; } Circle;
typedef struct { Shape base; double w, h; } Rectangle;

static double circle_area(Shape *s) { return M_PI * ((Circle *)s)->r * ((Circle *)s)->r; }
static double rect_area(Shape *s)   { Rectangle *r = (Rectangle *)s; return r->w * r->h; }

int main(void) {
    Circle c    = { .base.area = circle_area, .r = 3 };
    Rectangle r = { .base.area = rect_area, .w = 4, .h = 5 };
    Shape *shapes[] = { (Shape *)&c, (Shape *)&r };
    for (int i = 0; i < 2; i++)
        printf("area = %.2f\\n", shapes[i]->area(shapes[i]));
    return 0;
}`,
        output: `area = 28.27
area = 20.00`
      }
    ],
    cpp: [
      {
        title: "C++ — virtual functions",
        blurb: "Mark the base method virtual; subclasses override it.",
        explain: `C++ requires you to opt in with <code>virtual</code>. Without it, calls are resolved statically and overrides won't fire when called through a base pointer.`,
        code: `#include <iostream>
using namespace std;

struct Shape {
    virtual double area() const = 0;
    virtual ~Shape() = default;
};

struct Circle : Shape {
    double r;
    Circle(double r) : r(r) {}
    double area() const override { return 3.14159265 * r * r; }
};

struct Rectangle : Shape {
    double w, h;
    Rectangle(double w, double h) : w(w), h(h) {}
    double area() const override { return w * h; }
};

int main() {
    Circle c(3);
    Rectangle r(4, 5);
    cout << "circle    -> " << c.area() << endl;
    cout << "rectangle -> " << r.area() << endl;
    return 0;
}`,
        output: `circle    -> 28.2743
rectangle -> 20`
      }
    ],
    js: [
      {
        title: "JavaScript — class extends + virtual methods",
        blurb: "ES6 classes look almost identical to Python's.",
        explain: `Behind the scenes JavaScript uses prototype-based inheritance, but ES6 <code>class</code> syntax makes it look familiar. Methods are virtual by default; subclass overrides win.`,
        code: `class Shape {
    area() { throw new Error("not implemented"); }
}
class Circle extends Shape {
    constructor(r) { super(); this.r = r; }
    area() { return Math.PI * this.r ** 2; }
}
class Rectangle extends Shape {
    constructor(w, h) { super(); this.w = w; this.h = h; }
    area() { return this.w * this.h; }
}

const shapes = [new Circle(3), new Rectangle(4, 5)];
for (const s of shapes)
    console.log(\`\${s.constructor.name} -> \${s.area().toFixed(2)}\`);`,
        output: `Circle -> 28.27
Rectangle -> 20.00`
      }
    ]
  },

  /* ============================ INHERITANCE ============================ */
  inherit: {
    ruby: [
      {
        title: "Ruby — single inheritance + super",
        blurb: "One parent class; mixins handle the rest.",
        explain: `Ruby supports single inheritance for classes (one parent), and uses <code>module</code> mixins to share behavior across unrelated class hierarchies.<br><br>
<code>super</code> with no parens passes through whatever arguments the current method received; <code>super(...)</code> lets you change them.`,
        code: `class Animal
  def initialize(name); @name = name; end
  def speak; "#{@name} makes a sound."; end
end

class Dog < Animal
  def initialize(name, breed)
    super(name)
    @breed = breed
  end
  def speak
    "#{super} Woof! (a #{@breed})"
  end
end

puts Dog.new("Rex", "Husky").speak`,
        output: `Rex makes a sound. Woof! (a Husky)`
      },
      {
        title: "Ruby — modules as mixins",
        blurb: "Multiple inheritance via include.",
        explain: `Ruby's answer to multiple inheritance is the <code>module</code>. <code>include</code> a module and its methods become instance methods of your class — no diamond problem, no parent ambiguity.`,
        code: `module Greeter
  def hello; "Hello, I'm #{name}!"; end
end

module Farewell
  def bye; "Bye from #{name}"; end
end

class Person
  attr_reader :name
  include Greeter
  include Farewell
  def initialize(name); @name = name; end
end

p = Person.new("Ada")
puts p.hello
puts p.bye`,
        output: `Hello, I'm Ada!
Bye from Ada`
      }
    ],
    c: [
      {
        title: "C — inheritance via composition",
        blurb: "Embed the 'parent' struct as the first field.",
        explain: `C has no inheritance keyword. The standard trick: put the "parent" struct as the first member, so a pointer to the child can be safely cast to a pointer to the parent.`,
        code: `#include <stdio.h>
#include <string.h>

typedef struct { char name[32]; } Animal;
typedef struct {
    Animal base;
    char breed[32];
} Dog;

void Animal_init(Animal *a, const char *name) { strncpy(a->name, name, 31); }
void Dog_init(Dog *d, const char *name, const char *breed) {
    Animal_init(&d->base, name);
    strncpy(d->breed, breed, 31);
}

int main(void) {
    Dog rex;
    Dog_init(&rex, "Rex", "Husky");
    Animal *as_animal = (Animal *)&rex;
    printf("%s is a %s\\n", as_animal->name, rex.breed);
    return 0;
}`,
        output: `Rex is a Husky`
      }
    ],
    cpp: [
      {
        title: "C++ — public inheritance",
        blurb: "Multiple inheritance is allowed (with care).",
        explain: `<code>class Dog : public Animal</code> creates an "is-a" relationship. C++ allows multiple inheritance, but it brings the diamond problem — solved with virtual inheritance or by using interfaces (abstract classes with no state).`,
        code: `#include <iostream>
#include <string>
using namespace std;

struct Animal {
    string name;
    Animal(string n) : name(n) {}
    virtual string speak() { return name + " makes a sound."; }
    virtual ~Animal() = default;
};

struct Dog : Animal {
    string breed;
    Dog(string n, string b) : Animal(n), breed(b) {}
    string speak() override {
        return Animal::speak() + " Woof! (a " + breed + ")";
    }
};

int main() {
    Dog rex("Rex", "Husky");
    cout << rex.speak() << endl;
}`,
        output: `Rex makes a sound. Woof! (a Husky)`
      }
    ],
    js: [
      {
        title: "JavaScript — class extends",
        blurb: "Sugar over prototypes; reads exactly like Python.",
        explain: `ES6 classes desugar to prototype chains. <code>extends</code> sets the prototype, <code>super()</code> invokes the parent constructor.`,
        code: `class Animal {
    constructor(name) { this.name = name; }
    speak() { return \`\${this.name} makes a sound.\`; }
}

class Dog extends Animal {
    constructor(name, breed) {
        super(name);
        this.breed = breed;
    }
    speak() {
        return super.speak() + \` Woof! (a \${this.breed})\`;
    }
}

console.log(new Dog("Rex", "Husky").speak());`,
        output: `Rex makes a sound. Woof! (a Husky)`
      }
    ]
  },

  /* ============================ ENCAPSULATION ============================ */
  encap: {
    ruby: [
      {
        title: "Ruby — public, protected, private",
        blurb: "True access modifiers, plus attr_* helpers.",
        explain: `Ruby has real access modifiers. <code>private</code> methods can only be called without an explicit receiver. <code>attr_reader</code>, <code>attr_writer</code>, and <code>attr_accessor</code> generate getters and setters automatically.`,
        code: `class Account
  attr_reader :balance       # auto-generates a getter

  def initialize(balance, pin)
    @balance = balance
    @pin = pin                # @ instance variables are private by default
  end

  def withdraw(amount, pin)
    return false if pin != @pin || amount > @balance
    @balance -= amount
    true
  end

  private

  def secret_audit
    puts "internal log: balance is #{@balance}"
  end
end

a = Account.new(100, "1234")
a.withdraw(30, "1234")
puts "balance = #{a.balance}"

begin
  a.secret_audit
rescue NoMethodError => e
  puts "blocked: #{e.message}"
end`,
        output: `balance = 70
blocked: private method 'secret_audit' called for an instance of Account`
      }
    ],
    c: [
      {
        title: "C — opaque pointers",
        blurb: "Hide implementation by hiding the struct definition.",
        explain: `C has no visibility modifiers, but you can hide struct fields by declaring an incomplete type in the header and only defining the full struct in the .c file.`,
        code: `#include <stdio.h>
#include <stdlib.h>

typedef struct Account Account;
struct Account { double balance; };

Account *account_create(double balance) {
    Account *a = (Account *)malloc(sizeof *a);
    a->balance = balance;
    return a;
}
double account_balance(Account *a) { return a->balance; }
int account_withdraw(Account *a, double amount) {
    if (amount > a->balance) return 0;
    a->balance -= amount;
    return 1;
}

int main(void) {
    Account *a = account_create(100);
    account_withdraw(a, 30);
    printf("balance = %.2f\\n", account_balance(a));
    return 0;
}`,
        output: `balance = 70.00`
      }
    ],
    cpp: [
      {
        title: "C++ — private/public/protected",
        blurb: "Enforced visibility plus const-correctness.",
        explain: `C++ has the full set: <code>private</code>, <code>protected</code>, <code>public</code>. <code>const</code> member functions promise not to modify the object — a kind of read-only encapsulation the compiler enforces.`,
        code: `#include <iostream>
#include <string>
using namespace std;

class Account {
    double balance;
    string pin;
public:
    Account(double b, string p) : balance(b), pin(p) {}
    double getBalance() const { return balance; }
    bool withdraw(double amount, const string &p) {
        if (p != pin || amount > balance) return false;
        balance -= amount;
        return true;
    }
};

int main() {
    Account a(100, "1234");
    a.withdraw(30, "1234");
    cout << "balance = " << a.getBalance() << endl;
}`,
        output: `balance = 70`
      }
    ],
    js: [
      {
        title: "JavaScript — # private fields (modern)",
        blurb: "True private fields, enforced by the runtime.",
        explain: `Modern JavaScript supports truly private class fields with a leading <code>#</code>. They're inaccessible from outside the class — even via reflection.`,
        code: `class Account {
    #balance;
    #pin;
    constructor(balance, pin) {
        this.#balance = balance;
        this.#pin = pin;
    }
    get balance() { return this.#balance; }
    withdraw(amount, pin) {
        if (pin !== this.#pin || amount > this.#balance) return false;
        this.#balance -= amount;
        return true;
    }
}

const a = new Account(100, "1234");
a.withdraw(30, "1234");
console.log("balance =", a.balance);`,
        output: `balance = 70`
      }
    ]
  },

  /* ============================ CALLBACKS ============================ */
  cb: {
    ruby: [
      {
        title: "Ruby — blocks, the most-used callback",
        blurb: "Every Ruby iterator takes a block.",
        explain: `Ruby's most idiomatic callback is the <strong>block</strong>: a chunk of code passed implicitly to a method. <code>each</code>, <code>map</code>, <code>select</code> all take blocks. Use <code>yield</code> inside the method to invoke it.`,
        code: `def run_for_each(items)
  items.each { |x| yield x }
end

run_for_each(["ada", "linus"]) { |n| puts "hello, #{n}" }
run_for_each(["ada", "linus"]) { |n| puts "HEY #{n.upcase}" }`,
        output: `hello, ada
hello, linus
HEY ADA
HEY LINUS`
      },
      {
        title: "Ruby — explicit Proc and lambda",
        blurb: "Blocks captured as first-class objects.",
        explain: `When you want to store a callback in a variable, use <code>proc</code> or <code>lambda</code>. Both are <code>Proc</code> objects; <code>lambda</code> is stricter about argument count and how <code>return</code> behaves.`,
        code: `greet  = ->(name) { puts "hello, #{name}" }
shout  = ->(name) { puts "HEY #{name.upcase}" }

["ada", "linus"].each(&greet)
["ada", "linus"].each(&shout)`,
        output: `hello, ada
hello, linus
HEY ADA
HEY LINUS`
      }
    ],
    c: [
      {
        title: "C — function pointers",
        blurb: "The original callback mechanism.",
        explain: `Function pointers are how the C standard library does callbacks: <code>qsort</code>, <code>signal</code>, <code>atexit</code>, all rely on them.`,
        code: `#include <stdio.h>

void run_for_each(const char *names[], int n, void (*cb)(const char *)) {
    for (int i = 0; i < n; i++) cb(names[i]);
}

void greet(const char *name) { printf("hello, %s\\n", name); }
void shout(const char *name) { printf("HEY %s!\\n", name); }

int main(void) {
    const char *names[] = { "ada", "linus" };
    run_for_each(names, 2, greet);
    run_for_each(names, 2, shout);
    return 0;
}`,
        output: `hello, ada
hello, linus
HEY ada!
HEY linus!`
      }
    ],
    cpp: [
      {
        title: "C++ — std::function + lambdas",
        blurb: "Type-erased callable that accepts anything callable.",
        explain: `<code>std::function</code> wraps any callable — function pointer, lambda, member function — into a single uniform type. Pair it with lambdas for clean callback APIs.`,
        code: `#include <iostream>
#include <vector>
#include <functional>
#include <string>
using namespace std;

void run_for_each(const vector<string> &xs, function<void(const string &)> cb) {
    for (const auto &x : xs) cb(x);
}

int main() {
    vector<string> names = { "ada", "linus" };
    run_for_each(names, [](const string &n) { cout << "hello, " << n << endl; });
    return 0;
}`,
        output: `hello, ada
hello, linus`
      }
    ],
    js: [
      {
        title: "JavaScript — first-class functions, native callbacks",
        blurb: "Almost word-for-word with the Python version.",
        explain: `Callbacks are everywhere in JavaScript: array methods (<code>forEach</code>, <code>map</code>, <code>filter</code>), DOM events, timers, every async API.`,
        code: `function runForEach(items, cb) {
    for (const x of items) cb(x);
}

const names = ["ada", "linus"];
runForEach(names, n => console.log("hello,", n));
runForEach(names, n => console.log("HEY", n.toUpperCase()));`,
        output: `hello, ada
hello, linus
HEY ADA
HEY LINUS`
      }
    ]
  },

  /* ============================ CLOSURES ============================ */
  closure: {
    ruby: [
      {
        title: "Ruby — Procs are closures",
        blurb: "Blocks capture their surrounding scope.",
        explain: `Every Ruby block, lambda, or Proc captures the local variables of the scope where it was created — that's a closure. Reassigning a captured variable inside the block <em>does</em> mutate the outer one (no <code>nonlocal</code> keyword needed).`,
        code: `def make_counter
  count = 0
  -> { count += 1 }     # closure over count
end

c = make_counter
puts c.call
puts c.call
puts c.call`,
        output: `1
2
3`
      }
    ],
    c: [
      {
        title: "C — no real closures, simulate with structs",
        blurb: "Pass a struct holding state alongside the function pointer.",
        explain: `C has no closures at the language level. The standard workaround: bundle the captured state in a struct and pass it to the function explicitly.`,
        code: `#include <stdio.h>

typedef struct {
    int (*fn)(void *);
    int count;
} Counter;

static int counter_call(void *self) {
    Counter *c = (Counter *)self;
    return ++c->count;
}

int main(void) {
    Counter c = { .fn = counter_call, .count = 0 };
    printf("%d\\n", c.fn(&c));
    printf("%d\\n", c.fn(&c));
    printf("%d\\n", c.fn(&c));
    return 0;
}`,
        output: `1
2
3`
      }
    ],
    cpp: [
      {
        title: "C++ — lambdas with [&] or [=] capture",
        blurb: "Choose by-reference [&] or by-copy [=] capture.",
        explain: `C++ lambdas capture by-reference (<code>[&]</code>) or by-copy (<code>[=]</code>). Mark the lambda <code>mutable</code> if you want to modify a by-copy captured variable.`,
        code: `#include <iostream>
#include <functional>
using namespace std;

function<int()> make_counter() {
    int count = 0;
    return [count]() mutable { return ++count; };
}

int main() {
    auto c = make_counter();
    cout << c() << endl;
    cout << c() << endl;
    cout << c() << endl;
}`,
        output: `1
2
3`
      }
    ],
    js: [
      {
        title: "JavaScript — closures are everywhere",
        blurb: "Probably the cleanest closure syntax of the bunch.",
        explain: `JavaScript closures work just like Python's. Every function carries a reference to the variables of the scope it was defined in.`,
        code: `function makeCounter() {
    let count = 0;
    return () => ++count;
}

const c = makeCounter();
console.log(c());
console.log(c());
console.log(c());`,
        output: `1
2
3`
      }
    ]
  },

  /* ============================ RECURSION ============================ */
  recursion: {
    ruby: [
      {
        title: "Ruby — factorial",
        blurb: "Same algorithm, terser syntax.",
        explain: `Ruby recursion is straightforward. The interpreter doesn't optimize tail calls by default, so deep recursion can blow the stack — same as Python and JS.`,
        code: `def factorial(n)
  return 1 if n <= 1
  n * factorial(n - 1)
end

(1..6).each { |i| puts "#{i}! = #{factorial(i)}" }`,
        output: `1! = 1
2! = 2
3! = 6
4! = 24
5! = 120
6! = 720`,
        trace: [
          { kind: "call",   depth: 1, name: "factorial", args: { n: "1" } },
          { kind: "return", depth: 1, name: "factorial", value: "1" },
          { kind: "print",  depth: 0, text: "1! = 1" },
          { kind: "call",   depth: 1, name: "factorial", args: { n: "2" } },
          { kind: "call",   depth: 2, name: "factorial", args: { n: "1" } },
          { kind: "return", depth: 2, name: "factorial", value: "1" },
          { kind: "return", depth: 1, name: "factorial", value: "2" },
          { kind: "print",  depth: 0, text: "2! = 2" },
          { kind: "note",   depth: 0, text: "Pattern continues for 3!, 4!, 5!, 6!" }
        ]
      }
    ],
    c: [
      {
        title: "C — factorial (live in browser)",
        blurb: "Runs live via JSCPP.",
        explain: `Recursion in C is straightforward and JSCPP handles it fine.`,
        code: `#include <stdio.h>

long factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    for (int i = 1; i <= 6; i++)
        printf("%d! = %ld\\n", i, factorial(i));
    return 0;
}`,
        output: `1! = 1
2! = 2
3! = 6
4! = 24
5! = 120
6! = 720`
      },
      {
        title: "C — Fibonacci",
        blurb: "Naive recursion + the speed of compiled code.",
        explain: `Naive Fibonacci is O(2^n) in any language, but in C it's so fast you barely notice for small n.`,
        code: `#include <stdio.h>

long fib(int n) {
    if (n < 2) return n;
    return fib(n - 1) + fib(n - 2);
}

int main(void) {
    for (int i = 0; i < 10; i++) printf("fib(%d) = %ld\\n", i, fib(i));
    return 0;
}`,
        output: `fib(0) = 0
fib(1) = 1
fib(2) = 1
fib(3) = 2
fib(4) = 3
fib(5) = 5
fib(6) = 8
fib(7) = 13
fib(8) = 21
fib(9) = 34`
      }
    ],
    cpp: [
      {
        title: "C++ — Tower of Hanoi",
        blurb: "Recursion shines on problems that are naturally recursive.",
        explain: `Hanoi's recursive structure ("move n-1 to spare, then 1 to target, then n-1 onto target") maps directly to a 4-line function.`,
        code: `#include <iostream>
using namespace std;

void hanoi(int n, char src, char dst, char aux) {
    if (n == 0) return;
    hanoi(n - 1, src, aux, dst);
    cout << "move disk " << n << ": " << src << " -> " << dst << endl;
    hanoi(n - 1, aux, dst, src);
}

int main() { hanoi(3, 'A', 'C', 'B'); }`,
        output: `move disk 1: A -> C
move disk 2: A -> B
move disk 1: C -> B
move disk 3: A -> C
move disk 1: B -> A
move disk 2: B -> C
move disk 1: A -> C`
      }
    ],
    js: [
      {
        title: "JavaScript — factorial",
        blurb: "Same shape as Python; V8 is fast.",
        explain: `JS recursion is unremarkable — same model as Python. Modern engines don't perform tail-call optimization, so deep recursion will still hit a stack-overflow limit (~10k frames).`,
        code: `function factorial(n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

for (let i = 1; i <= 6; i++) console.log(\`\${i}! = \${factorial(i)}\`);`,
        output: `1! = 1
2! = 2
3! = 6
4! = 24
5! = 120
6! = 720`,
        trace: [
          { kind: "call",   depth: 1, name: "factorial", args: { n: "1" } },
          { kind: "return", depth: 1, name: "factorial", value: "1" },
          { kind: "print",  depth: 0, text: "1! = 1" },
          { kind: "call",   depth: 1, name: "factorial", args: { n: "2" } },
          { kind: "call",   depth: 2, name: "factorial", args: { n: "1" } },
          { kind: "return", depth: 2, name: "factorial", value: "1" },
          { kind: "return", depth: 1, name: "factorial", value: "2" },
          { kind: "print",  depth: 0, text: "2! = 2" },
          { kind: "note",   depth: 0, text: "Pattern continues for 3!, 4!, 5!, 6!" }
        ]
      }
    ]
  },

  /* ============================ GENERATORS ============================ */
  gen: {
    ruby: [
      {
        title: "Ruby — Enumerator.new with yield",
        blurb: "Lazy sequences, just like Python.",
        explain: `Ruby has first-class lazy iteration via <code>Enumerator</code>. <code>y &lt;&lt; value</code> inside an <code>Enumerator.new</code> block produces values one at a time, just like Python's generator functions.`,
        code: `countdown = Enumerator.new do |y|
  n = 3
  while n > 0
    y << n     # like Python's "yield n"
    n -= 1
  end
end

countdown.each { |v| puts v }

# Infinite lazy sequence
naturals = Enumerator.new { |y| n = 1; loop { y << n; n += 1 } }
puts naturals.lazy.map { |n| n * n }.first(5).inspect`,
        output: `3
2
1
[1, 4, 9, 16, 25]`
      }
    ],
    c: [
      {
        title: "C — no generators, do it by hand",
        blurb: "Hold state in a struct and advance it on each call.",
        explain: `C has no <code>yield</code> and no coroutines in the standard library. To produce values lazily, model the iterator as a struct that holds its position and exposes <code>next()</code>.`,
        code: `#include <stdio.h>

typedef struct { int n; } Countdown;

int countdown_next(Countdown *c) {
    if (c->n <= 0) return -1;
    return c->n--;
}

int main(void) {
    Countdown c = { .n = 3 };
    int v;
    while ((v = countdown_next(&c)) != -1) printf("%d\\n", v);
    return 0;
}`,
        output: `3
2
1`
      }
    ],
    cpp: [
      {
        title: "C++ — manual iterator (JSCPP-friendly)",
        blurb: "Pre-C++20 generator pattern.",
        explain: `Without C++20 coroutines, the closest you get is a stateful iterator. Build a class with <code>operator()</code> or a <code>next()</code> method.`,
        code: `#include <iostream>
using namespace std;

class Countdown {
    int n;
public:
    Countdown(int start) : n(start) {}
    bool has_next() const { return n > 0; }
    int next() { return n--; }
};

int main() {
    Countdown c(3);
    while (c.has_next()) cout << c.next() << endl;
    return 0;
}`,
        output: `3
2
1`
      }
    ],
    js: [
      {
        title: "JavaScript — function* and yield",
        blurb: "Almost identical to Python's syntax.",
        explain: `JavaScript adopted generator syntax very close to Python's: <code>function*</code> for the function and <code>yield</code> inside.`,
        code: `function* countdown(n) {
    while (n > 0) {
        yield n;
        n--;
    }
}

for (const v of countdown(3)) console.log(v);`,
        output: `3
2
1`
      }
    ]
  }
};
