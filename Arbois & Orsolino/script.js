/* ═══════════════════════════════════════
   SCRIPT.JS — Multi-Language Lexer Simulator
   Languages: Python · C++
   Phase 1: Lexical Analysis
═══════════════════════════════════════ */

/* ══════════════════════════════════════════
   LANGUAGE DEFINITIONS
══════════════════════════════════════════ */
const LANG_CONFIG = {
  python: {
    label:    'Python',
    filename: 'program.py',
    pipeLabel:'Lexer ★',
    refTitle: 'Python Token Reference',
    refBody:
`KEYWORDS (35):
  False    None     True     and      as
  assert   async    await    break    class
  continue def      del      elif     else
  except   finally  for      from     global
  if       import   in       is       lambda
  nonlocal not      or       pass     raise
  return   try      while    with     yield

TOKEN TYPES:
  KEYWORD    — reserved word
  IDENTIFIER — variable / function / class name
  NUMBER     — int, float, complex, hex, octal, binary
  STRING     — "…"  '…'  f"…"  r"…"  b"…"  """…"""
  OPERATOR   — + - * / // ** % @ = == != < > <= >=
               << >> & | ^ ~ and or not += -= etc.
  DELIMITER  — ( ) [ ] { } , : ; .
  COMMENT    — # through end of line`,
    explainTitle: 'Python — Lexical Analysis',
    explainBody: `<p><span class="hlg">Python's Lexer</span> reads source code character by character and groups them into typed tokens — the first phase of the interpreter pipeline.</p>
<p>Python has <strong>35 reserved keywords</strong> that cannot be used as identifiers. The lexer always classifies them as <span class="hl">KEYWORD</span> first.</p>
<ul>
  <li><span class="hl">KEYWORD</span> — <span class="hl">def</span>, <span class="hl">if</span>, <span class="hl">for</span>, <span class="hl">while</span>, <span class="hl">return</span>, <span class="hl">class</span>, <span class="hl">async</span> …</li>
  <li><span class="hli">IDENTIFIER</span> — any name starting with a letter or underscore</li>
  <li><span class="hln">NUMBER</span> — integers, floats, complex (<span class="hln">4j</span>), hex (<span class="hln">0xFF</span>), octal (<span class="hln">0o77</span>), binary (<span class="hln">0b101</span>)</li>
  <li><span class="hls">STRING</span> — single, double, triple-quoted; f-strings, r-strings, b-strings</li>
  <li><span class="hlo">OPERATOR</span> — arithmetic, comparison, logical, bitwise, augmented assignment</li>
  <li><span class="hlp">DELIMITER</span> — parentheses, brackets, braces, commas, colons, semicolons</li>
  <li><span class="hlr">COMMENT</span> — <span class="hlr"># text</span> — captured as a token but ignored by the parser</li>
</ul>
<p>A <span class="hlr">Lexical Error</span> occurs when an unrecognised character is found outside a string or comment (e.g. <span class="hlr">$</span>, <span class="hlr">\\</span>).</p>`
  },

  cpp: {
    label:    'C++',
    filename: 'program.cpp',
    pipeLabel:'Lexer ★',
    refTitle: 'C++ Token Reference',
    refBody:
`KEYWORDS (selected):
  int    float  double  char    bool
  void   auto   const   static  inline
  if     else   for     while   do
  return break  continue switch  case
  class  struct enum    public  private
  new    delete true    false   nullptr
  using  namespace template typename
  constexpr  noexcept  override  final

TOKEN TYPES:
  KEYWORD      — reserved word
  IDENTIFIER   — variable / function / type name
  NUMBER       — 42  3.14f  0xFF  0b101  1'000ULL
  STRING       — "…"  R"(…)"
  CHAR         — '…'
  OPERATOR     — + - * / % = == != < > <= >= && ||
                 ++ -- -> :: << >> += -= ... ?:
  PREPROCESSOR — #include #define #ifdef #pragma …
  COMMENT      — // line   or   /* block */`,
    explainTitle: 'C++ — Lexical Analysis',
    explainBody: `<p><span class="hlg">C++ Lexical Analysis</span> is the first translation phase — it converts raw source text into a flat stream of typed tokens.</p>
<p>The C++ lexer produces six primary token categories:</p>
<ul>
  <li><span class="hl">KEYWORD</span> — <span class="hl">int</span>, <span class="hl">class</span>, <span class="hl">return</span>, <span class="hl">nullptr</span>, <span class="hl">constexpr</span> …</li>
  <li><span class="hli">IDENTIFIER</span> — names for variables, functions, and types</li>
  <li><span class="hln">NUMBER</span> — integer (<span class="hln">42</span>), float (<span class="hln">3.14f</span>), hex (<span class="hln">0xFF</span>), binary (<span class="hln">0b101</span>), digit-separator (<span class="hln">1'000</span>)</li>
  <li><span class="hls">STRING / CHAR</span> — <span class="hls">"hello"</span> or <span class="hls">'A'</span> or raw literal <span class="hls">R"(...)"</span></li>
  <li><span class="hlo">OPERATOR</span> — arithmetic, relational, logical, bitwise, and punctuators</li>
  <li><span class="hlp">PREPROCESSOR</span> — directives beginning with <span class="hlp">#</span> (handled before compilation)</li>
</ul>
<p><span class="hlr">Lexical Errors</span> occur for invalid characters outside strings/comments (e.g. <span class="hlr">$</span>, <span class="hlr">@</span>).</p>`
  }
};

/* ══════════════════════════════════════════
   TOKEN DESCRIPTIONS
══════════════════════════════════════════ */
const TOKEN_DESC = {
  python: {
    keyword:   'Reserved word — cannot be used as an identifier',
    identifier:'Name — variable, function, class, or module',
    number:    'Numeric literal — int, float, complex, hex, octal, or binary',
    string:    'String literal — single, double, triple-quoted, or prefixed (f/r/b)',
    operator:  'Operator — arithmetic, comparison, logical, bitwise, or augmented',
    delimiter: 'Delimiter — parenthesis, bracket, brace, comma, colon, or semicolon',
    comment:   'Comment — ignored by the interpreter'
  },
  cpp: {
    keyword:     'Reserved word — part of the C++ language specification',
    identifier:  'Name — variable, function, class, or type',
    number:      'Numeric literal — int, float, hex, octal, binary, or digit-separated',
    string:      'String literal — text enclosed in double quotes or raw literal R"(...)"',
    char:        'Character literal — single character enclosed in single quotes',
    operator:    'Operator or punctuator — arithmetic, relational, logical, or separator',
    preprocessor:'Preprocessor directive — processed before compilation begins',
    comment:     'Comment — ignored by the compiler'
  }
};

/* ══════════════════════════════════════════
   KEYWORD SETS
══════════════════════════════════════════ */
const PYTHON_KEYWORDS = new Set([
  'False','None','True','and','as','assert','async','await','break','class',
  'continue','def','del','elif','else','except','finally','for','from','global',
  'if','import','in','is','lambda','nonlocal','not','or','pass','raise',
  'return','try','while','with','yield'
]);

const CPP_KEYWORDS = new Set([
  'alignas','alignof','and','and_eq','asm','auto','bitand','bitor','bool','break',
  'case','catch','char','char8_t','char16_t','char32_t','class','compl','concept',
  'const','consteval','constexpr','constinit','const_cast','continue','co_await',
  'co_return','co_yield','decltype','default','delete','do','double','dynamic_cast',
  'else','enum','explicit','export','extern','false','float','for','friend','goto',
  'if','inline','int','long','mutable','namespace','new','noexcept','not','not_eq',
  'nullptr','operator','or','or_eq','private','protected','public','register',
  'reinterpret_cast','requires','return','short','signed','sizeof','static',
  'static_assert','static_cast','struct','switch','template','this','thread_local',
  'throw','true','try','typedef','typeid','typename','union','unsigned','using',
  'virtual','void','volatile','wchar_t','while','xor','xor_eq',
  // common stdlib names treated as keywords for display purposes
  'cout','cin','endl','string','vector','include','define','ifdef','ifndef',
  'endif','pragma','std','main','size_t','uint8_t','uint16_t','uint32_t','uint64_t',
  'int8_t','int16_t','int32_t','int64_t','override','final','noreturn'
]);

/* ══════════════════════════════════════════
   SAMPLE PROGRAMS
══════════════════════════════════════════ */
const SAMPLES = {
  python: {
    hello_world:
`# Hello World in Python
def greet(name):
    message = "Hello, " + name + "!"
    return message

user = "World"
result = greet(user)
print(result)`,

    fibonacci:
`# Fibonacci sequence
def fibonacci(n):
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b

for i in range(10):
    print(fibonacci(i))`,

    class_example:
`# Class definition
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    def area(self):
        return self.width * self.height

    def perimeter(self):
        return 2 * (self.width + self.height)

    def __repr__(self):
        return f"Rectangle({self.width}, {self.height})"

rect = Rectangle(5, 3)
print(rect.area())
print(rect.perimeter())
print(repr(rect))`,

    list_comprehension:
`# List comprehensions and generators
numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

evens = [n for n in numbers if n % 2 == 0]
squares = [n ** 2 for n in numbers]
total = sum(n for n in numbers if n % 2 != 0)

print(evens)
print(squares)
print(total)`,

    exception_handling:
`# Exception handling
def safe_divide(a, b):
    try:
        result = a / b
        return result
    except ZeroDivisionError:
        print("Error: cannot divide by zero")
        return None
    except TypeError as e:
        print(f"Type error: {e}")
        return None
    finally:
        print("Operation complete")

print(safe_divide(10, 2))
print(safe_divide(10, 0))`,

    decorators:
`# Decorators and closures
import functools

def timer(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        result = func(*args, **kwargs)
        return result
    return wrapper

@timer
def compute(n):
    return sum(range(n))

value = compute(1000)
print(value)`
  },

  cpp: {
    hello_world:
`// Hello World in C++
#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`,

    functions:
`// Functions and overloading
#include <iostream>
using namespace std;

int add(int a, int b) {
    return a + b;
}

double add(double a, double b) {
    return a + b;
}

int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    cout << add(3, 4) << endl;
    cout << add(2.5, 1.5) << endl;
    cout << factorial(6) << endl;
    return 0;
}`,

    class_example:
`// Class with constructors and methods
#include <iostream>
#include <string>
using namespace std;

class Animal {
private:
    string name;
    int age;

public:
    Animal(const string& n, int a) : name(n), age(a) {}

    virtual void speak() const {
        cout << name << " makes a sound." << endl;
    }

    string getName() const { return name; }
    int getAge() const { return age; }

    virtual ~Animal() = default;
};

class Dog : public Animal {
public:
    Dog(const string& name, int age) : Animal(name, age) {}

    void speak() const override {
        cout << getName() << " says: Woof!" << endl;
    }
};

int main() {
    Dog dog("Rex", 3);
    dog.speak();
    cout << dog.getAge() << endl;
    return 0;
}`,

    templates:
`// Templates and STL
#include <iostream>
#include <vector>
#include <algorithm>
#include <string>
using namespace std;

template <typename T>
T findMax(const vector<T>& v) {
    return *max_element(v.begin(), v.end());
}

int main() {
    vector<int> scores = {85, 92, 78, 96, 88, 74};
    vector<string> names = {"Alice", "Bob", "Charlie"};

    cout << "Max score: " << findMax(scores) << endl;
    cout << "Last name: " << findMax(names) << endl;

    sort(scores.begin(), scores.end());
    for (int s : scores) {
        cout << s << " ";
    }
    cout << endl;
    return 0;
}`,

    pointers:
`// Pointers, references and memory
#include <iostream>
using namespace std;

void swap(int& a, int& b) {
    int temp = a;
    a = b;
    b = temp;
}

int* createArray(int size) {
    return new int[size];
}

int main() {
    int x = 10, y = 20;
    cout << "Before: " << x << ", " << y << endl;
    swap(x, y);
    cout << "After: " << x << ", " << y << endl;

    int* arr = createArray(5);
    for (int i = 0; i < 5; i++) {
        arr[i] = (i + 1) * 10;
    }
    for (int i = 0; i < 5; i++) {
        cout << arr[i] << " ";
    }
    cout << endl;
    delete[] arr;
    return 0;
}`,

    lambdas:
`// Lambdas and modern C++
#include <iostream>
#include <vector>
#include <algorithm>
#include <functional>
using namespace std;

int main() {
    vector<int> nums = {3, 1, 4, 1, 5, 9, 2, 6, 5, 3};

    auto isEven = [](int n) { return n % 2 == 0; };
    auto square = [](int n) -> int { return n * n; };

    int evens = count_if(nums.begin(), nums.end(), isEven);
    cout << "Even count: " << evens << endl;

    sort(nums.begin(), nums.end(), [](int a, int b) {
        return a > b;
    });

    for_each(nums.begin(), nums.end(), [](int n) {
        cout << n << " ";
    });
    cout << endl;
    return 0;
}`
  }
};

/* ══════════════════════════════════════════
   PYTHON LEXER
══════════════════════════════════════════ */
function lexPython(code) {
  const tokens = [];
  const lines = code.split('\n');
  for (const rawLine of lines) {
    const line = rawLine;
    let i = 0;
    while (i < line.length) {
      // Whitespace
      if (/\s/.test(line[i])) { i++; continue; }

      // Comment
      if (line[i] === '#') {
        tokens.push({ type: 'comment', value: line.slice(i) });
        break;
      }

      // String prefix detection: f, r, b, u, fr, rb etc.
      const strPrefixMatch = line.slice(i).match(/^([fFbBrRuU]{1,2})(?=['"])/);
      const strPrefix = strPrefixMatch ? strPrefixMatch[1] : '';
      const strStart = i + strPrefix.length;

      if (strPrefix || line[strStart] === '"' || line[strStart] === "'") {
        const si = strStart;
        if (si < line.length && (line[si] === '"' || line[si] === "'")) {
          // Triple-quoted?
          if (line.slice(si, si+3) === '"""' || line.slice(si, si+3) === "'''") {
            const q = line.slice(si, si+3);
            let j = si + 3;
            while (j < line.length && line.slice(j, j+3) !== q) j++;
            tokens.push({ type: 'string', value: strPrefix + line.slice(si, j+3) });
            i = j + 3; continue;
          }
          // Single-quoted
          const q = line[si];
          let j = si + 1;
          while (j < line.length && line[j] !== q) {
            if (line[j] === '\\') j++;
            j++;
          }
          tokens.push({ type: 'string', value: strPrefix + line.slice(si, j+1) });
          i = j + 1; continue;
        }
      }

      // Number
      if (/\d/.test(line[i]) || (line[i] === '.' && /\d/.test(line[i+1] || ''))) {
        let j = i;
        if (line.slice(j, j+2).toLowerCase() === '0x') {
          j += 2; while (j < line.length && /[0-9a-fA-F_]/.test(line[j])) j++;
        } else if (line.slice(j, j+2).toLowerCase() === '0b') {
          j += 2; while (j < line.length && /[01_]/.test(line[j])) j++;
        } else if (line.slice(j, j+2).toLowerCase() === '0o') {
          j += 2; while (j < line.length && /[0-7_]/.test(line[j])) j++;
        } else {
          while (j < line.length && /[\d_]/.test(line[j])) j++;
          if (line[j] === '.' && /\d/.test(line[j+1] || '')) {
            j++; while (j < line.length && /[\d_]/.test(line[j])) j++;
          }
          if (j < line.length && (line[j] === 'e' || line[j] === 'E')) {
            j++; if (line[j] === '+' || line[j] === '-') j++;
            while (j < line.length && /\d/.test(line[j])) j++;
          }
          if (j < line.length && line[j] === 'j') j++;
        }
        tokens.push({ type: 'number', value: line.slice(i, j) });
        i = j; continue;
      }

      // Identifier or keyword
      if (/[a-zA-Z_]/.test(line[i])) {
        let j = i;
        while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
        const word = line.slice(i, j);
        tokens.push({ type: PYTHON_KEYWORDS.has(word) ? 'keyword' : 'identifier', value: word });
        i = j; continue;
      }

      // Walrus operator :=
      if (line.slice(i, i+2) === ':=') {
        tokens.push({ type: 'operator', value: ':=' }); i += 2; continue;
      }

      // Two-char operators
      const two = line.slice(i, i+2);
      if (['**','//','==','!=','<=','>=','<<','>>','+=','-=','*=','/=','%=',
           '&=','|=','^=','->','~=','//=','**='].includes(two)) {
        tokens.push({ type: 'operator', value: two }); i += 2; continue;
      }

      // Delimiters
      if ('()[]{},:;.'.includes(line[i])) {
        tokens.push({ type: 'delimiter', value: line[i] }); i++; continue;
      }

      // Single-char operators
      if ('+-*/%@=<>&|^~!'.includes(line[i])) {
        tokens.push({ type: 'operator', value: line[i] }); i++; continue;
      }

      // Unknown — lexical error token (flagged but not breaking)
      tokens.push({ type: 'error', value: line[i] }); i++;
    }
  }
  return tokens;
}

/* ══════════════════════════════════════════
   C++ LEXER
══════════════════════════════════════════ */
function lexCpp(code) {
  const tokens = [];
  const lines = code.split('\n');
  let inBlockComment = false;

  for (const rawLine of lines) {
    const line = rawLine;
    let i = 0;

    // Continue block comment from previous line
    if (inBlockComment) {
      const end = line.indexOf('*/');
      if (end !== -1) {
        inBlockComment = false;
        i = end + 2;
      } else {
        tokens.push({ type: 'comment', value: line });
        continue;
      }
    }

    while (i < line.length) {
      // Whitespace
      if (/\s/.test(line[i])) { i++; continue; }

      // Line comment
      if (line.slice(i, i+2) === '//') {
        tokens.push({ type: 'comment', value: line.slice(i) }); break;
      }

      // Block comment
      if (line.slice(i, i+2) === '/*') {
        const end = line.indexOf('*/', i+2);
        if (end !== -1) {
          tokens.push({ type: 'comment', value: line.slice(i, end+2) });
          i = end + 2; continue;
        } else {
          tokens.push({ type: 'comment', value: line.slice(i) });
          inBlockComment = true; break;
        }
      }

      // Preprocessor — capture full line
      if (line[i] === '#') {
        tokens.push({ type: 'preprocessor', value: line.slice(i) }); break;
      }

      // Raw string literal R"delimiter(content)delimiter"
      if (line.slice(i, i+2) === 'R"') {
        const parenPos = line.indexOf('(', i+2);
        if (parenPos !== -1) {
          const delim = line.slice(i+2, parenPos);
          const closeSeq = ')' + delim + '"';
          const closePos = line.indexOf(closeSeq, parenPos+1);
          if (closePos !== -1) {
            tokens.push({ type: 'string', value: line.slice(i, closePos + closeSeq.length) });
            i = closePos + closeSeq.length; continue;
          }
        }
        // Fall through to regular string handling
      }

      // String
      if (line[i] === '"') {
        let j = i + 1;
        while (j < line.length && line[j] !== '"') {
          if (line[j] === '\\') j++;
          j++;
        }
        tokens.push({ type: 'string', value: line.slice(i, j+1) });
        i = j + 1; continue;
      }

      // Char literal
      if (line[i] === "'") {
        let j = i + 1;
        while (j < line.length && line[j] !== "'") {
          if (line[j] === '\\') j++;
          j++;
        }
        tokens.push({ type: 'char', value: line.slice(i, j+1) });
        i = j + 1; continue;
      }

      // Number (supports digit separator ' in C++14+)
      if (/\d/.test(line[i]) || (line[i] === '.' && /\d/.test(line[i+1] || ''))) {
        let j = i;
        if (line.slice(j, j+2).toLowerCase() === '0x') {
          j += 2; while (j < line.length && /[0-9a-fA-F_']/.test(line[j])) j++;
        } else if (line.slice(j, j+2).toLowerCase() === '0b') {
          j += 2; while (j < line.length && /[01_']/.test(line[j])) j++;
        } else {
          while (j < line.length && /[\d_']/.test(line[j])) j++;
          if (line[j] === '.' && /\d/.test(line[j+1] || '')) {
            j++; while (j < line.length && /[\d_']/.test(line[j])) j++;
          }
          if (j < line.length && (line[j] === 'e' || line[j] === 'E')) {
            j++; if (line[j] === '+' || line[j] === '-') j++;
            while (j < line.length && /\d/.test(line[j])) j++;
          }
          while (j < line.length && 'fFlLuU'.includes(line[j])) j++;
        }
        tokens.push({ type: 'number', value: line.slice(i, j) });
        i = j; continue;
      }

      // Identifier or keyword
      if (/[a-zA-Z_]/.test(line[i])) {
        let j = i;
        while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
        const word = line.slice(i, j);
        tokens.push({ type: CPP_KEYWORDS.has(word) ? 'keyword' : 'identifier', value: word });
        i = j; continue;
      }

      // Three-char operators
      const three = line.slice(i, i+3);
      if (['<<=', '>>=', '...'].includes(three)) {
        tokens.push({ type: 'operator', value: three }); i += 3; continue;
      }

      // Two-char operators
      const two = line.slice(i, i+2);
      if (['::','->','++','--','<<','>>','<=','>=','==','!=','&&','||',
           '+=','-=','*=','/=','%=','&=','|=','^=','.*','->*'].includes(two)) {
        tokens.push({ type: 'operator', value: two }); i += 2; continue;
      }

      // Punctuators
      if ('()[]{}:;,.'.includes(line[i])) {
        tokens.push({ type: 'operator', value: line[i] }); i++; continue;
      }

      // Single-char operators
      if ('+-*/%=<>&|^~!?@'.includes(line[i])) {
        // @ not valid in C++ outside strings — mark as error
        if (line[i] === '@') { tokens.push({ type: 'error', value: line[i] }); i++; continue; }
        tokens.push({ type: 'operator', value: line[i] }); i++; continue;
      }

      // Unknown — lexical error
      tokens.push({ type: 'error', value: line[i] }); i++;
    }
  }
  return tokens;
}

function lex(code, lang) {
  return lang === 'cpp' ? lexCpp(code) : lexPython(code);
}

/* ══════════════════════════════════════════
   VALIDATORS — Lexical errors only
══════════════════════════════════════════ */
function validatePython(code) {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Scan outside strings and comments
    let inStr = false, strChar = '', j = 0;
    while (j < line.length) {
      const ch = line[j];
      if (!inStr && ch === '#') break;
      if (!inStr && (ch === '"' || ch === "'")) {
        inStr = true; strChar = ch; j++; continue;
      }
      if (inStr && ch === strChar) { inStr = false; j++; continue; }
      if (inStr) { if (ch === '\\') j++; j++; continue; }
      if (/[$`\\]/.test(ch)) {
        return {
          lineNum: i+1, phase: 'Lexical Error', phaseNum: 1,
          msg: `Invalid character "${ch}" on line ${i+1}`,
          explain: `The Python lexer encountered "${ch}" which is not valid Python syntax outside of a string or comment. Python identifiers may only use letters (a–z, A–Z), digits (0–9), and underscores (_).`,
          fix: `Remove the "${ch}" character.`
        };
      }
      j++;
    }
    // Unclosed string on this line
    if (!inStr) {
      const stripped = line.replace(/#.*$/, '');
      const dq = (stripped.match(/(?<!\\)"/g) || []).length;
      const sq = (stripped.match(/(?<!\\)'/g) || []).length;
      if (dq % 2 !== 0) {
        return {
          lineNum: i+1, phase: 'Lexical Error', phaseNum: 1,
          msg: `Unclosed string literal (double quote) on line ${i+1}`,
          explain: `The lexer found an opening " without a matching closing " on the same line. A STRING token must begin and end with matching quote characters.`,
          fix: `Add a closing double-quote: "your text"`
        };
      }
      if (sq % 2 !== 0) {
        return {
          lineNum: i+1, phase: 'Lexical Error', phaseNum: 1,
          msg: `Unclosed string literal (single quote) on line ${i+1}`,
          explain: `The lexer found an opening ' without a matching closing ' on the same line.`,
          fix: `Add a closing single-quote: 'your text'`
        };
      }
    }
  }
  return null;
}

function validateCpp(code) {
  const lines = code.split('\n');
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let j = 0, inStr = false, inChar = false;

    if (inBlock) {
      const end = line.indexOf('*/');
      if (end !== -1) { inBlock = false; j = end + 2; }
      else continue;
    }

    while (j < line.length) {
      const ch = line[j];
      if (!inStr && !inChar && line.slice(j, j+2) === '//') break;
      if (!inStr && !inChar && line.slice(j, j+2) === '/*') {
        const end = line.indexOf('*/', j+2);
        if (end !== -1) { j = end + 2; continue; }
        else { inBlock = true; break; }
      }
      if (!inChar && ch === '"') { inStr = !inStr; j++; continue; }
      if (!inStr && ch === "'") { inChar = !inChar; j++; continue; }
      if (inStr || inChar) { if (ch === '\\') j++; j++; continue; }
      if (!inStr && !inChar && line[j] === '#') break; // preprocessor line — skip
      if (/[$`?@]/.test(ch)) {
        return {
          lineNum: i+1, phase: 'Lexical Error', phaseNum: 1,
          msg: `Invalid character "${ch}" on line ${i+1}`,
          explain: `The C++ lexer encountered "${ch}" which is not a valid token character in C++ source code outside of a string or comment.`,
          fix: `Remove the "${ch}" character.`
        };
      }
      j++;
    }

    // Unclosed string check (skip preprocessor and comment lines)
    if (!inBlock && !line.trim().startsWith('#')) {
      const stripped = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      const dq = (stripped.match(/(?<!\\)"/g) || []).length;
      if (dq % 2 !== 0) {
        return {
          lineNum: i+1, phase: 'Lexical Error', phaseNum: 1,
          msg: `Unclosed string literal on line ${i+1}`,
          explain: `The C++ lexer found an opening " without a matching closing " on the same line. A STRING token requires a matching closing double-quote.`,
          fix: `Add a closing double-quote to complete the string.`
        };
      }
    }
  }
  return null;
}

function validate(code, lang) {
  return lang === 'cpp' ? validateCpp(code) : validatePython(code);
}

/* ══════════════════════════════════════════
   CURRENT LANGUAGE STATE
══════════════════════════════════════════ */
let currentLang = 'python';

/* ══════════════════════════════════════════
   DOM REFERENCES
══════════════════════════════════════════ */
const editor         = document.getElementById('editor');
const compileBtn     = document.getElementById('compileBtn');
const sampleBtn      = document.getElementById('sampleBtn');
const stepModeBtn    = document.getElementById('stepModeBtn');
const nextStepBtn    = document.getElementById('nextStepBtn');
const stepControls   = document.getElementById('stepControls');
const stepLabel      = document.getElementById('stepLabel');
const themeBtn       = document.getElementById('themeBtn');
const tokenContainer = document.getElementById('tokenContainer');
const tokenTableBody = document.getElementById('tokenTableBody');
const tokenBadge     = document.getElementById('tokenBadge');
const consoleOut     = document.getElementById('console');
const phaseBanner    = document.getElementById('phaseBanner');
const errorPanel     = document.getElementById('errorPanel');
const errorList      = document.getElementById('errorList');
const errorPill      = document.getElementById('errorPill');
const lineNums       = document.getElementById('lineNums');
const liveLabel      = document.getElementById('liveLabel');
const liveChips      = document.getElementById('liveChips');
const varTableWrap   = document.getElementById('varTableWrap');
const varTableBody   = document.getElementById('varTableBody');
const phaseSummary   = document.getElementById('phaseSummary');
const summaryGrid    = document.getElementById('summaryGrid');
const langLabel      = document.getElementById('langLabel');
const editorFilename = document.getElementById('editorFilename');
const bnfPanelTitle  = document.getElementById('bnfPanelTitle');
const bnfPanelBody   = document.getElementById('bnfPanelBody');
const explainCardTitle = document.getElementById('explainCardTitle');

const dots  = { lexer: document.getElementById('lexer-dot') };
const pipes = { lexer: document.getElementById('pipe-lexer') };

/* ══════════════════════════════════════════
   LANGUAGE SWITCHER
══════════════════════════════════════════ */
function applyLanguage(lang) {
  const cfg = LANG_CONFIG[lang];
  langLabel.textContent        = cfg.label;
  editorFilename.textContent   = cfg.filename;
  bnfPanelTitle.textContent    = cfg.refTitle;
  bnfPanelBody.textContent     = cfg.refBody;
  explainCardTitle.textContent = cfg.explainTitle;
  document.getElementById('pipe-lexer').innerHTML =
    `<span class="pipe-dot"></span>${cfg.pipeLabel}`;
}

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const lang = btn.getAttribute('data-lang');
    if (lang === currentLang) return;
    currentLang = lang;
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyLanguage(lang);
    editor.value = '';
    updateLineNums();
    clearErrors();
    resetCompiler();
    liveLabel.textContent = 'Start typing to see live tokens…';
    liveChips.innerHTML = '';
    clog(`Language switched to ${LANG_CONFIG[lang].label}`, 'info');
    if (typeof gsap !== 'undefined') {
      gsap.from('#bnfPanel',    { opacity: 0, y: 5, duration: 0.35 });
      gsap.from('#explain-lexer', { opacity: 0, y: 5, duration: 0.35, delay: 0.05 });
    }
  });
});

// Apply default language on load
applyLanguage(currentLang);

/* ══════════════════════════════════════════
   SIDEBAR TOGGLE (mobile)
══════════════════════════════════════════ */
const sidebarToggle  = document.getElementById('sidebarToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebar        = document.querySelector('.sidebar');

function openSidebar()  { sidebar.classList.add('open'); sidebarOverlay.classList.add('show'); }
function closeSidebar() { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('show'); }

if (sidebarToggle) {
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
}
if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', closeSidebar);
}

/* ══════════════════════════════════════════
   THEME TOGGLE
══════════════════════════════════════════ */
themeBtn.addEventListener('click', () => {
  document.body.classList.toggle('light');
  themeBtn.textContent = document.body.classList.contains('light') ? '☀️' : '🌙';
  themeBtn.classList.toggle('light-mode', document.body.classList.contains('light'));
});

/* ══════════════════════════════════════════
   BNF / REFERENCE PANEL TOGGLE
══════════════════════════════════════════ */
function toggleBnf() {
  const panel = document.getElementById('bnfPanel');
  if (!panel) return;
  const body = panel.querySelector('.bnf-body');
  panel.classList.toggle('open');
  const isOpen = panel.classList.contains('open');
  if (body) body.style.display = isOpen ? 'block' : 'none';
}

/* ══════════════════════════════════════════
   EXPLAIN CARD TOGGLE
══════════════════════════════════════════ */
function toggleExplain(id) {
  const c = document.getElementById(id);
  if (c) c.classList.toggle('open');
}

/* ══════════════════════════════════════════
   SIDEBAR NAV
══════════════════════════════════════════ */
const explainMap = { lexer: 'explain-lexer' };
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const sec = btn.getAttribute('data-section');
    document.querySelectorAll('.section-view').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('section-' + sec);
    if (el) el.classList.add('active');
    Object.values(explainMap).forEach(id => {
      const c = document.getElementById(id); if (c) c.classList.remove('open');
    });
    const cid = explainMap[sec];
    if (cid) setTimeout(() => {
      const c = document.getElementById(cid); if (c) c.classList.add('open');
    }, 110);
  });
});

/* ══════════════════════════════════════════
   LINE NUMBERS + LIVE PREVIEW
══════════════════════════════════════════ */
function updateLineNums() {
  const n = editor.value.split('\n').length;
  lineNums.innerHTML = Array.from({ length: n }, (_, i) => `<div>${i+1}</div>`).join('');
}

editor.addEventListener('scroll', () => { lineNums.scrollTop = editor.scrollTop; });

/* Smart indentation — Tab, Enter after colon/brace, Backspace de-indent */
editor.addEventListener('keydown', e => {

  const val   = editor.value;
  const start = editor.selectionStart;
  const end   = editor.selectionEnd;

  // ── TAB → insert 4 spaces ──
  if (e.key === 'Tab') {
    e.preventDefault();
    const spaces = '    ';
    editor.value = val.slice(0, start) + spaces + val.slice(end);
    editor.selectionStart = editor.selectionEnd = start + 4;
    updateLineNums();
    return;
  }

  // ── ENTER → smart indent ──
  if (e.key === 'Enter') {
    e.preventDefault();

    // Get current line text
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const currentLine = val.slice(lineStart, start);

    // Detect existing indentation level
    const indentMatch = currentLine.match(/^(\s*)/);
    const currentIndent = indentMatch ? indentMatch[1] : '';

    // Python: increase indent after lines ending with ':'
    // C++: increase indent after lines ending with '{', or containing '{' before '}'
    const trimmed = currentLine.trimEnd();
    const needsExtraIndent =
      trimmed.endsWith(':') ||                          // Python colon
      trimmed.endsWith('{') ||                          // C++ open brace
      (trimmed.endsWith('(') && currentLang === 'cpp'); // C++ multi-line call

    const newIndent = needsExtraIndent
      ? currentIndent + '    '
      : currentIndent;

    // C++: if we're pressing enter right before a closing }, keep it de-dented
    const afterCursor = val.slice(start).trimStart();
    const closingBrace = afterCursor.startsWith('}');

    editor.value = val.slice(0, start) + '\n' + newIndent + val.slice(end);
    editor.selectionStart = editor.selectionEnd = start + 1 + newIndent.length;
    updateLineNums();
    return;
  }

  // ── BACKSPACE at start of indented line → remove one indent level ──
  if (e.key === 'Backspace' && start === end) {
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const charsBefore = val.slice(lineStart, start);
    // Only act if the cursor is at end of pure whitespace (4 spaces)
    if (charsBefore.length > 0 && /^ +$/.test(charsBefore) && charsBefore.length % 4 === 0) {
      e.preventDefault();
      const removeCount = 4;
      editor.value = val.slice(0, start - removeCount) + val.slice(start);
      editor.selectionStart = editor.selectionEnd = start - removeCount;
      updateLineNums();
    }
  }
});

let liveTimer;
editor.addEventListener('input', () => {
  updateLineNums();
  clearErrors();
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    const code = editor.value.trim();
    if (!code) {
      liveLabel.textContent = 'Start typing to see live tokens…';
      liveChips.innerHTML = '';
      return;
    }
    const tokens = lex(code, currentLang).filter(t => t.type !== 'error' && t.type !== 'comment');
    liveLabel.textContent = `Live preview — ${tokens.length} token${tokens.length !== 1 ? 's' : ''}:`;
    liveChips.innerHTML = '';
    tokens.slice(0, 14).forEach((t, i) => {
      const s = document.createElement('span');
      s.className = `live-chip ${t.type}`;
      s.textContent = t.value;
      s.style.animationDelay = `${i * 0.04}s`;
      liveChips.appendChild(s);
    });
    if (tokens.length > 14) {
      const m = document.createElement('span');
      m.className = 'live-chip';
      m.style.cssText = 'background:rgba(255,255,255,.06);color:var(--muted)';
      m.textContent = `+${tokens.length - 14} more`;
      liveChips.appendChild(m);
    }
  }, 200);
});

updateLineNums();

/* ══════════════════════════════════════════
   SAMPLE LOADER
══════════════════════════════════════════ */
const sampleIndices = { python: 0, cpp: 0 };
const shuffledSets  = { python: [], cpp: [] };

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getNextSample(lang) {
  const keys = Object.keys(SAMPLES[lang]);
  if (sampleIndices[lang] >= shuffledSets[lang].length) {
    shuffledSets[lang] = shuffleArray(keys.slice());
    sampleIndices[lang] = 0;
  }
  return SAMPLES[lang][shuffledSets[lang][sampleIndices[lang]++]];
}

sampleBtn.addEventListener('click', () => {
  const code = getNextSample(currentLang);
  editor.value = code;
  updateLineNums();
  clearErrors();
  clog(`Loaded ${LANG_CONFIG[currentLang].label} sample`, 'success');
});

/* ══════════════════════════════════════════
   CLEAR EDITOR
══════════════════════════════════════════ */
function clearEditor() {
  editor.value = '';
  updateLineNums();
  liveLabel.textContent = 'Start typing to see live tokens…';
  liveChips.innerHTML = '';
  clearErrors();
  resetCompiler();
}

/* ══════════════════════════════════════════
   STEP MODE
══════════════════════════════════════════ */
let stepMode = false, stepQueue = [], stepIndex = 0;

stepModeBtn.addEventListener('click', () => {
  stepMode = !stepMode;
  stepModeBtn.textContent       = stepMode ? '✕ Exit Steps' : '⏭ Step Mode';
  stepModeBtn.style.borderColor = stepMode ? 'var(--accent)' : '';
  stepModeBtn.style.color       = stepMode ? 'var(--accent)' : '';
  stepControls.classList.toggle('visible', stepMode);
  if (!stepMode) {
    stepQueue = []; stepIndex = 0;
    nextStepBtn.disabled = false;
    nextStepBtn.textContent = 'Next Step →';
  }
});

nextStepBtn.addEventListener('click', async () => {
  if (stepIndex >= stepQueue.length) return;
  nextStepBtn.disabled = true;
  await stepQueue[stepIndex]();
  stepIndex++;
  stepLabel.textContent = `Step ${stepIndex}/${stepQueue.length}`;
  if (stepIndex < stepQueue.length) nextStepBtn.disabled = false;
  else nextStepBtn.textContent = 'Done ✓';
});

/* ══════════════════════════════════════════
   COMPILE
══════════════════════════════════════════ */
compileBtn.addEventListener('click', () => {
  const code = editor.value.trim();
  if (!code) { clog('No source code detected.', 'error'); return; }
  resetCompiler();
  const err = validate(code, currentLang);
  if (err) { renderErrors([err]); return; }
  if (stepMode) {
    stepQueue = buildSteps(code);
    stepIndex = 0;
    stepLabel.textContent = `Step 0/${stepQueue.length}`;
    nextStepBtn.disabled  = false;
    nextStepBtn.textContent = 'Next Step →';
    clog('Step mode ready — click Next Step to begin.', 'info');
  } else {
    runAll(code);
  }
});

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') compileBtn.click();
});

/* ══════════════════════════════════════════
   PHASE RUNNERS
══════════════════════════════════════════ */
async function runAll(code) {
  const t = await phase1(code);
  buildSummary(t, code);
}

function buildSteps(code) {
  let _t;
  return [
    async () => { _t = await phase1(code); buildSummary(_t, code); }
  ];
}

async function phase1(code) {
  banner('Phase 1: Lexical Analysis Running…');
  setDot('lexer', 'running');
  setPipe('lexer', 'active');
  if (!stepMode) await wait(850);
  const allTokens  = lex(code, currentLang);
  const errTokens  = allTokens.filter(t => t.type === 'error');
  const goodTokens = allTokens.filter(t => t.type !== 'error' && t.type !== 'comment');
  const commentTokens = allTokens.filter(t => t.type === 'comment');
  renderTokens(goodTokens);
  setDot('lexer', 'done');
  setPipe('lexer', 'done');
  clog(`✔ Lexical analysis complete — ${goodTokens.length} tokens generated.${commentTokens.length ? ` (${commentTokens.length} comment line${commentTokens.length !== 1 ? 's' : ''} skipped)` : ''}`, 'success');
  if (errTokens.length) {
    clog(`⚠ ${errTokens.length} unrecognised character(s) skipped.`, 'error');
  }
  updateBadge('lexer', goodTokens.length);
  return goodTokens;
}

/* ══════════════════════════════════════════
   RENDER TOKENS
══════════════════════════════════════════ */
function renderTokens(tokens) {
  tokenContainer.innerHTML = '';
  tokenTableBody.innerHTML = '';
  tokenBadge.textContent = `${tokens.length} token${tokens.length !== 1 ? 's' : ''}`;
  const desc = TOKEN_DESC[currentLang] || {};

  tokens.forEach((tok, i) => {
    // Chip
    const chip = document.createElement('div');
    chip.className = `token ${tok.type}`;
    chip.textContent = `${tok.type.toUpperCase()} : ${tok.value}`;
    chip.title = desc[tok.type] || tok.type;
    tokenContainer.appendChild(chip);
    if (typeof gsap !== 'undefined')
      gsap.from(chip, { opacity: 0, y: 14, scale: 0.82, duration: 0.28, delay: i * 0.04 });

    // Table row
    const tr = document.createElement('tr');
    const tc = {
      keyword:     'var(--kw-col)',
      identifier:  'var(--id-col)',
      number:      'var(--num-col)',
      operator:    'var(--op-col)',
      string:      'var(--str-col)',
      char:        'var(--str-col)',
      delimiter:   'var(--muted2)',
      comment:     'var(--muted)',
      preprocessor:'var(--accent2)'
    }[tok.type] || 'var(--text)';

    tr.innerHTML = `
      <td class="tt-num">${i+1}</td>
      <td><span style="background:rgba(255,255,255,.06);color:${tc};border:1px solid ${tc}44;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">${tok.type.toUpperCase()}</span></td>
      <td style="font-size:11.5px;color:var(--muted2)">${desc[tok.type] || ''}</td>
      <td class="tt-lex">${esc(tok.value)}</td>
    `;
    tokenTableBody.appendChild(tr);
    if (typeof gsap !== 'undefined')
      gsap.from(tr, { opacity: 0, x: -8, duration: 0.25, delay: i * 0.035 });
  });

  switchSec('lexer');
}

/* ══════════════════════════════════════════
   BUILD SUMMARY
══════════════════════════════════════════ */
function buildSummary(tokens, code) {
  const types = tokens.reduce((acc, t) => { acc[t.type] = (acc[t.type] || 0) + 1; return acc; }, {});
  const lines = code.split('\n').filter(l => l.trim()).length;

  let extraRows = '';
  if (currentLang === 'python') {
    extraRows = `
      <div class="summary-row"><span>Delimiters</span><strong>${types.delimiter || 0}</strong></div>`;
  } else {
    extraRows = `
      <div class="summary-row"><span>Preprocessors</span><strong>${types.preprocessor || 0}</strong></div>
      <div class="summary-row"><span>Char Literals</span><strong>${types.char || 0}</strong></div>`;
  }

  summaryGrid.innerHTML = `
    <div class="summary-row"><span>Total Tokens</span><strong>${tokens.length}</strong></div>
    <div class="summary-row"><span>Source Lines</span><strong>${lines}</strong></div>
    <div class="summary-row"><span>Keywords</span><strong>${types.keyword || 0}</strong></div>
    <div class="summary-row"><span>Identifiers</span><strong>${types.identifier || 0}</strong></div>
    <div class="summary-row"><span>Numbers</span><strong>${types.number || 0}</strong></div>
    <div class="summary-row"><span>Operators</span><strong>${types.operator || 0}</strong></div>
    <div class="summary-row"><span>Strings</span><strong>${types.string || 0}</strong></div>
    ${extraRows}
    <div class="summary-row"><span>Errors</span><strong style="color:var(--success)">0</strong></div>
  `;
  phaseSummary.classList.add('show');
  if (typeof gsap !== 'undefined')
    gsap.from(phaseSummary, { opacity: 0, y: 8, duration: 0.5 });

  // Symbol table — unique identifiers
  const ids = [...new Set(tokens.filter(t => t.type === 'identifier').map(t => t.value))];
  if (ids.length) {
    varTableWrap.classList.add('show');
    varTableBody.innerHTML = ids.map(id => `
      <tr>
        <td style="font-family:'JetBrains Mono',monospace;color:var(--id-col);font-weight:600">${esc(id)}</td>
        <td style="color:var(--muted)">—</td>
        <td style="color:var(--muted2)">identifier</td>
      </tr>
    `).join('');
  }
}

/* ══════════════════════════════════════════
   ERROR RENDERING
══════════════════════════════════════════ */
function renderErrors(errs) {
  if (!errs.length) return;
  errorPanel.classList.add('visible');
  errorList.innerHTML = '';
  editor.classList.add('has-error');

  errs.forEach((e, idx) => {
    const div = document.createElement('div');
    div.className = 'error-item';
    div.innerHTML = `
      <div class="error-item-hdr">
        <span>⚠</span>
        <span>${esc(e.phase)}</span>
        <span class="error-line-tag">Line ${e.lineNum}</span>
      </div>
      <div class="error-msg">${esc(e.msg)}</div>
      <div class="error-explain">${esc(e.explain)}</div>
      ${e.fix ? `<span class="error-fix">✔ Fix:\n${esc(e.fix)}</span>` : ''}
    `;
    errorList.appendChild(div);
    if (typeof gsap !== 'undefined')
      gsap.from(div, { opacity: 0, x: -10, duration: 0.3, delay: idx * 0.07 });
  });

  const first = errs[0];
  errorPill.textContent = `⚠ ${first.phase} — Line ${first.lineNum}`;
  errorPill.classList.add('show');
  phaseBanner.textContent = `${first.phase} on Line ${first.lineNum} — stopped at Phase ${first.phaseNum}.`;
  phaseBanner.style.background  = 'rgba(239,68,68,.08)';
  phaseBanner.style.borderColor = 'rgba(239,68,68,.3)';
  phaseBanner.style.color       = 'var(--error)';
  clog(`[${first.phase}] ${first.msg}`, 'error');
  switchSec('lexer');
}

function clearErrors() {
  errorPanel.classList.remove('visible');
  errorList.innerHTML = '';
  editor.classList.remove('has-error');
  errorPill.classList.remove('show');
  phaseBanner.style.cssText = '';
}

function switchSec(sec) {
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.getAttribute('data-section') === sec)
  );
  document.querySelectorAll('.section-view').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('section-' + sec);
  if (el) el.classList.add('active');
}

/* ══════════════════════════════════════════
   PIPELINE / DOT / BADGE HELPERS
══════════════════════════════════════════ */
function setDot(name, state) {
  const d = dots[name]; if (!d) return;
  d.classList.remove('done', 'running');
  if (state === 'done')    d.classList.add('done');
  if (state === 'running') d.classList.add('running');
}
function setPipe(name, state) {
  const p = pipes[name]; if (!p) return;
  p.classList.remove('active', 'done');
  if (state) p.classList.add(state);
}
function updateBadge(sec, count) {
  const btn = document.querySelector(`.nav-btn[data-section="${sec}"]`); if (!btn) return;
  const b   = btn.querySelector('.nav-badge'); if (!b) return;
  b.textContent = count;
  btn.classList.add('has-badge');
}

/* ══════════════════════════════════════════
   CONSOLE
══════════════════════════════════════════ */
function clog(msg, type = 'info') {
  const d = document.createElement('div');
  d.className   = type;
  d.textContent = (type === 'success' ? '✔ ' : type === 'error' ? '✘ ' : '  ') + msg;
  consoleOut.appendChild(d);
  consoleOut.scrollTop = consoleOut.scrollHeight;
}
function banner(msg) { phaseBanner.textContent = msg; }
function wait(ms)    { return new Promise(r => setTimeout(r, ms)); }
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════════
   RESET
══════════════════════════════════════════ */
function resetCompiler() {
  tokenContainer.innerHTML = '';
  tokenTableBody.innerHTML = '<tr><td colspan="4" style="color:var(--muted);padding:13px;text-align:center">Run the compiler to populate the token table.</td></tr>';
  consoleOut.innerHTML     = '';
  tokenBadge.textContent   = '0 tokens';
  varTableBody.innerHTML   = '';
  varTableWrap.classList.remove('show');
  phaseSummary.classList.remove('show');
  Object.keys(dots).forEach(k  => setDot(k, null));
  Object.keys(pipes).forEach(k => { pipes[k].classList.remove('active', 'done'); });
  pipes.lexer.classList.add('focused');
  banner('Translation in progress…');
  phaseBanner.style.cssText = '';
  clog('Starting translation process…', 'info');
}

/* ══════════════════════════════════════════
   MATRIX RAIN BACKGROUND
══════════════════════════════════════════ */
(function () {
  const canvas = document.getElementById('matrixCanvas');
  const ctx    = canvas.getContext('2d');
  const CHARS  = '01アイウカキクケサシスセタチツ{}[]()=+*/><;:ABCDEF'.split('');
  const FS     = 14;
  let cols, drops;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    cols  = Math.floor(canvas.width / FS);
    drops = Array(cols).fill(1);
  }
  function draw() {
    const isLight = document.body.classList.contains('light');
    ctx.fillStyle = isLight ? 'rgba(255,255,255,0.06)' : 'rgba(2,9,23,.06)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = FS + 'px "JetBrains Mono",monospace';
    for (let i = 0; i < drops.length; i++) {
      const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
      const y  = drops[i] * FS;
      const r  = Math.random();
      if (isLight) {
        if      (y < canvas.height * 0.12) ctx.fillStyle = '#0f172a';
        else if (r > 0.97)                 ctx.fillStyle = '#6b21a8';
        else if (r > 0.92)                 ctx.fillStyle = '#0ea5a3';
        else                               ctx.fillStyle = '#065f46';
      } else {
        if      (y < canvas.height * 0.12) ctx.fillStyle = '#fff';
        else if (r > 0.97)                 ctx.fillStyle = '#a78bfa';
        else if (r > 0.92)                 ctx.fillStyle = '#22d3ee';
        else                               ctx.fillStyle = '#00e87a';
      }
      ctx.fillText(ch, i * FS, y);
      if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }
  resize();
  window.addEventListener('resize', resize);
  setInterval(draw, 34);
})();

/* ══════════════════════════════════════════
   INIT ANIMATIONS
══════════════════════════════════════════ */
gsap.from('.sidebar',      { x: -70, opacity: 0, duration: 0.9, ease: 'power3.out' });
gsap.from('.topbar',       { y: -18, opacity: 0, duration: 0.7, delay: 0.15 });
gsap.from('.pipeline-bar', { y: -14, opacity: 0, duration: 0.6, delay: 0.25 });
gsap.from('.panel',        { y: 26,  opacity: 0, duration: 0.8, stagger: 0.18, delay: 0.2 });