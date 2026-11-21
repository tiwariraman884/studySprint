export const LAB_TEMPLATES = [
  {
    id: "py-gcd",
    language: "python",
    subjectId: "py",
    name: "GCD & LCM · exercise 10",
    aim: "Compute the Greatest Common Divisor (GCD) and Least Common Multiple (LCM) of two integers using Euclid's algorithm.",
    stdin: "12\n18",
    code: 'import math\n\na = int(input())\nb = int(input())\ng = math.gcd(a, b)\nlcm = 0 if a == 0 or b == 0 else abs(a * b) // g\nprint("GCD:", g)\nprint("LCM:", lcm)',
    tests: [
      { input: "12\n18", expected: "GCD: 6\nLCM: 36", description: "Standard composite integers" },
      { input: "7\n13", expected: "GCD: 1\nLCM: 91", description: "Co-prime integers" },
    ],
    viva: [
      { question: "What is the time complexity of Euclid's GCD algorithm?", answer: "O(log(min(a, b))) because the remainder decreases by at least half every two steps." },
      { question: "Why is math.gcd preferred over manual loops in production?", answer: "math.gcd is implemented in optimized C in CPython and handles arbitrary-precision integers efficiently." },
    ],
  },
  {
    id: "py-frequency",
    language: "python",
    subjectId: "py",
    name: "Character frequency · exercise 5",
    aim: "Count and sort the frequencies of distinct characters in a string.",
    stdin: "hello",
    code: "from collections import Counter\n\ntext = input()\nfor char, count in sorted(Counter(text).items()):\n    print(repr(char), count)",
    tests: [
      { input: "hello", expected: "'e' 1\n'h' 1\n'l' 2\n'o' 1", description: "Repeated character count" },
    ],
    viva: [
      { question: "How does collections.Counter store elements?", answer: "Counter is a dict subclass where elements are stored as dictionary keys and their counts are stored as dictionary values." },
    ],
  },
  {
    id: "py-files",
    language: "python",
    subjectId: "py",
    name: "Files & counts · exercise 7",
    aim: "Create a temporary file and report counts of characters, words, and lines.",
    stdin: "",
    code: 'text = "Hi all\\nBye"\nwith open("notes.txt", "w", encoding="utf-8") as f:\n    f.write(text)\nwith open("notes.txt", encoding="utf-8") as f:\n    content = f.read()\nprint("Characters:", len(content))\nprint("Words:", len(content.split()))\nprint("Lines:", len(content.splitlines()))\n# Files here are temporary and reset on the next run.',
    tests: [
      { input: "", expected: "Characters: 10\nWords: 3\nLines: 2", description: "File text metric counts" },
    ],
    viva: [
      { question: "Why is the 'with' statement used in file handling?", answer: "The context manager automatically guarantees closing the file even if exceptions occur during read/write." },
    ],
  },
  {
    id: "py-bug",
    language: "python",
    subjectId: "py",
    name: "Debug challenge · off-by-one",
    aim: "Identify and rectify an off-by-one loop index exception.",
    stdin: "",
    code: "# Goal: print every list element. Find the bug.\nvalues = [10, 20, 30]\nfor i in range(len(values)):\n    print(values[i])",
    tests: [
      { input: "", expected: "10\n20\n30", description: "Iterate across all valid indices" },
    ],
    viva: [
      { question: "What causes an IndexError in Python list indexing?", answer: "Attempting to access an index >= len(sequence) or < -len(sequence)." },
    ],
  },
  {
    id: "cpp-template",
    language: "cpp",
    subjectId: "cpp",
    name: "Generic function · OOP unit 4",
    aim: "Implement a C++ template function for generic comparison across multiple datatypes.",
    stdin: "",
    code: '#include <iostream>\n\ntemplate <typename T>\nT larger(T a, T b) {\n    return a > b ? a : b;\n}\n\nint main() {\n    std::cout << larger(4, 9) << "\\n";\n    std::cout << larger(2.5, 1.8) << "\\n";\n}',
    tests: [
      { input: "", expected: "9\n2.5", description: "Integer and double generic comparison" },
    ],
    viva: [
      { question: "What is template instantiation in C++?", answer: "The compiler generates a concrete function or class for each distinct set of template arguments used at compile time." },
    ],
  },
  {
    id: "cpp-exception",
    language: "cpp",
    subjectId: "cpp",
    name: "Exception handling · OOP unit 4",
    aim: "Handle runtime zero division using std::invalid_argument in C++.",
    stdin: "0",
    code: '#include <iostream>\n#include <stdexcept>\n\nint main() {\n    int denominator;\n    std::cin >> denominator;\n    try {\n        if (denominator == 0)\n            throw std::invalid_argument("Denominator is zero");\n        std::cout << 10.0 / denominator << "\\n";\n    } catch (const std::exception& error) {\n        std::cerr << error.what() << "\\n";\n    }\n}',
    tests: [
      { input: "0", expected: "Denominator is zero", description: "Zero denominator caught" },
      { input: "2", expected: "5", description: "Valid division calculation" },
    ],
    viva: [
      { question: "Why catch exceptions by const reference in C++?", answer: "Prevents slicing of derived exception objects and avoids unnecessary copy constructor overhead." },
    ],
  },
  {
    id: "c-array",
    language: "c",
    subjectId: "dsa",
    name: "Linear Search & Pointer Arithmetic · C17",
    aim: "Search an array of integers using pointer traversal in standard C17.",
    stdin: "5\n10 20 30 40 50\n30",
    code: '#include <stdio.h>\n\nint search(const int *arr, int n, int key) {\n    for (int i = 0; i < n; i++) {\n        if (*(arr + i) == key) return i;\n    }\n    return -1;\n}\n\nint main(void) {\n    int n, key;\n    if (scanf("%d", &n) != 1 || n <= 0) return 1;\n    int arr[100];\n    for (int i = 0; i < n; i++) scanf("%d", &arr[i]);\n    scanf("%d", &key);\n    int idx = search(arr, n, key);\n    if (idx != -1) printf("Found at index %d\\n", idx);\n    else printf("Not found\\n");\n    return 0;\n}',
    tests: [
      { input: "5\n10 20 30 40 50\n30", expected: "Found at index 2", description: "Element present in array" },
      { input: "3\n1 2 3\n9", expected: "Not found", description: "Element absent from array" },
    ],
    viva: [
      { question: "What is the relationship between array indexing arr[i] and *(arr + i)?", answer: "arr[i] is syntactically equivalent to *(arr + i) and resolves through pointer arithmetic scaled by sizeof(element)." },
    ],
  },
  {
    id: "java-stack",
    language: "java",
    subjectId: "dsa",
    name: "Stack Operations · Java 21",
    aim: "Demonstrate LIFO stack behavior with push, pop, and peek in Java.",
    stdin: "",
    code: 'import java.util.Stack;\n\npublic class Main {\n    public static void main(String[] args) {\n        Stack<Integer> s = new Stack<>();\n        s.push(10);\n        s.push(20);\n        s.push(30);\n        System.out.println("Top: " + s.peek());\n        System.out.println("Popped: " + s.pop());\n        System.out.println("Size: " + s.size());\n    }\n}',
    tests: [
      { input: "", expected: "Top: 30\nPopped: 30\nSize: 2", description: "Standard LIFO stack execution" },
    ],
    viva: [
      { question: "Why is ArrayDeque preferred over java.util.Stack in modern Java?", answer: "java.util.Stack extends Vector which incurs thread-synchronization overhead; ArrayDeque is unsynchronized and faster." },
    ],
  },
  {
    id: "sql-students",
    language: "sql",
    subjectId: "dsa",
    name: "Schema & Aggregation · SQL",
    aim: "Create an in-memory student table, insert records, and compute aggregate grade statistics.",
    stdin: "",
    code: 'CREATE TABLE students (id INT PRIMARY KEY, name TEXT, marks INT);\nINSERT INTO students VALUES (1, "Raman", 92), (2, "Aman", 85), (3, "Priya", 94);\nSELECT count(*), avg(marks), max(marks) FROM students;',
    tests: [
      { input: "", expected: "(3, 90.33333333333333, 94)", description: "Aggregate row computation" },
    ],
    viva: [
      { question: "What is the difference between WHERE and HAVING in SQL?", answer: "WHERE filters rows before aggregation, while HAVING filters groups after aggregation." },
    ],
  },
  {
    id: "js-search",
    language: "javascript",
    subjectId: "dsa",
    name: "Binary search · DSA",
    aim: "Execute binary search on a sorted numerical array.",
    stdin: "",
    code: "function binarySearch(a, target) {\n  let low = 0, high = a.length - 1;\n  while (low <= high) {\n    const mid = Math.floor((low + high) / 2);\n    if (a[mid] === target) return mid;\n    if (a[mid] < target) low = mid + 1;\n    else high = mid - 1;\n  }\n  return -1;\n}\nconsole.log(binarySearch([2, 4, 6, 8, 10], 8));",
    tests: [
      { input: "", expected: "3", description: "Target index in sorted array" },
    ],
    viva: [
      { question: "Why must the array be sorted before applying binary search?", answer: "Binary search relies on monotonic ordering to eliminate half of the remaining search space at each comparison." },
    ],
  },
];
