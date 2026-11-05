import library from '../data/coding-library.json';

export const CODING_LIBRARY_VERSION = `exercism-${library.revision.slice(0, 12)}`;
export const codingLibrarySource = { name: 'Exercism', license: 'MIT', revision: library.revision, url: 'https://github.com/exercism/problem-specifications' };
export const librarySeedKey = (slug: string) => `exercism-library-${slug}`;
export const libraryProblem = (seedKey: string) => library.problems.find(p => librarySeedKey(p.slug) === seedKey);

const starterCode = {
  javascript: `const fs = require('fs');
const { operation, input } = JSON.parse(fs.readFileSync(0, 'utf8'));

function solve(operation, input) {
  // Implement the operation described in the problem.
  // Return a JSON value; for invalid input return { error: 'message' }.
  return null;
}

console.log(JSON.stringify(solve(operation, input)));`,
  python: `import json, sys

def solve(operation, data):
    # Implement the operation described in the problem.
    # Return a JSON value; for invalid input return {"error": "message"}.
    return None

request = json.load(sys.stdin)
print(json.dumps(solve(request["operation"], request["input"])))`,
  typescript: `const fs = require('fs');
const { operation, input } = JSON.parse(fs.readFileSync(0, 'utf8'));

function solve(operation, input) {
  // Implement your solution. Return a JSON value.
  return null;
}

console.log(JSON.stringify(solve(operation, input)));`,
  go: `package main
import ("encoding/json"; "os")
type Request struct { Operation string \`json:"operation"\`; Input json.RawMessage \`json:"input"\` }
func solve(operation string, input json.RawMessage) interface{} {
    // Decode input into the required fields and return a JSON value.
    return nil
}
func main() { var r Request; json.NewDecoder(os.Stdin).Decode(&r); json.NewEncoder(os.Stdout).Encode(solve(r.Operation, r.Input)) }`,
  java: `import java.io.*;
public class Main {
    static String solve(String request) {
        // Parse the JSON request (operation and input).
        // Return a JSON-encoded result. No external libraries are required.
        return "null";
    }
    public static void main(String[] args) throws Exception {
        String request = new String(System.in.readAllBytes());
        System.out.println(solve(request));
    }
}`,
  cpp: `#include <iostream>
#include <string>
#include <iterator>
using namespace std;
string solve(const string& request) {
    // Parse the JSON request (operation and input).
    // Return a JSON-encoded result.
    return "null";
}
int main() { string request((istreambuf_iterator<char>(cin)), {}); cout << solve(request) << endl; }`,
  c: `#include <stdio.h>
int main(void) {
    char request[65536];
    fgets(request, sizeof(request), stdin);
    /* Parse operation and input from the JSON request. Print a JSON result. */
    puts("null");
    return 0;
}`,
};

export const curatedCodingQuestions = library.problems.map(p => ({
  seedKey: librarySeedKey(p.slug), title: p.title, category: 'coding', topic: p.topic,
  difficulty: p.difficulty, source: 'curated', isActive: true,
  generationBatchId: CODING_LIBRARY_VERSION,
  prompt: `${p.prompt}\n\n## Placeble input and output\nRead one JSON object from standard input: {"operation": "name", "input": {...}}. Implement these operations: ${p.operations.join(', ')}. Print the result as one JSON value. Strings must be JSON-quoted; arrays and objects must be JSON. If the specification describes an error, return {"error":"the specified message"} instead of throwing. The examples below show the exact input and output contract.`,
  starterCode, testCases: p.testCases.map(({ input, expectedOutput, hidden }) => ({ input, expectedOutput, hidden })),
  examples: p.testCases.filter(c => !c.hidden).map(c => ({ input: c.input, output: c.expectedOutput, explanation: c.description })),
  constraints: ['Read exactly one JSON request per execution.', 'Print exactly one JSON result without extra text.', 'Object key order and JSON whitespace do not affect correctness; array order does.', 'Return integers outside the JavaScript safe integer range as JSON strings of exact decimal digits.', 'Return the specified error object for invalid input.'],
  tags: [p.topic, ...p.operations], hints: ['Study the input fields and operations in the examples.', 'Consider empty inputs, boundary values, and invalid inputs described in the specification.'],
  explanation: 'Choose a data structure that matches the operation, then check boundary conditions and the published examples. Source specifications and canonical tests are linked below.',
  timeLimitSeconds: 900,
}));
