# stack_questions
Linear algebra and calculus related stack libraries and question template.
XML pool will be found in xml.mathedu.jp.

# MCQ questions
```markdown
## MCQ Question Authoring

Please refer to `001.MCQ-rb.xml` and the included file `Sample.txt` for implementation examples.

All MCQ-related files are placed under the `001` directory.

The numbering convention is as follows:

- `001`: MCQ-type questions
- `005`: drill-type exercises without MCQ
- `010`: exercises with explanations intended for classroom use

Before implementing an MCQ, carefully consider:

- what mathematical concept the question is testing,
- and what kinds of incorrect answer patterns (misconceptions) are expected.

If the only possible incorrect answers are simple calculation mistakes, the problem is probably not suitable for MCQ format. In such cases, the `005` drill-type format with numerical or algebraic input may be more appropriate.

### Multilingual Question Text

Please create the question text in a multilingual-compatible form.

First, write the question in your preferred language.
Then, use the prompt below to generate a multilingual associative array.

The template system automatically selects and expands the appropriate language at runtime.

### Multilingual Choices

Prepare both:

- correct answer patterns
- incorrect answer patterns

If the choices themselves require multilingual support, use:

- `%__CoptL1L`
- `%__WoptL1L`

instead of:

- `%__CoptL1`
- `%__WoptL1`

The template system automatically detects these variable definitions and generates language-dependent choices appropriately.

### Multilingual Feedback

Feedback messages are fundamentally language-dependent.
Therefore, create feedback from the beginning as multilingual associative arrays.

In the future, when additional languages are added, we plan to use AI-assisted bulk conversion.

Currently, please support the following languages:

- English (`en`)
- French (`fr`)
- German (`de`)
- Italian (`it`)
- Japanese (`ja`)

If contributors are interested in supporting additional languages, we will try to accommodate them whenever possible.
```

## Prompt for Multilingual STACK / Maxima Translation

You are assisting with multilingual STACK question authoring using Maxima code.

Translate the given Japanese STACK/Maxima entry into English, French, German, Italian, and Japanese, and output a Maxima-style multilingual array.

### Critical Rules

1. Preserve all Maxima variable names exactly, including capitalization.
   - `weL` and `WeL` are different variables.
   - `wfeL` and `WfeL` are different variables.
   - Never change lowercase letters to uppercase or vice versa.

2. Preserve all Maxima functions exactly.
   Examples:
   - `sconcat`
   - `tex1`
   - `tex2`
   - `tex2L`
   - `matrix`
   - `addcol`
   - `submatrix`
   - `coeff`

3. Preserve all placeholders exactly.
   Examples:
   - `__SELTYPE__`
   - `{@...@}`
   - `%_...`
   - `MapFRmRn`
   - `OpS`

4. Translate only the human-readable text inside strings.

5. Never translate:
   - variable names
   - function names
   - placeholders
   - symbolic expressions
   - LaTeX expressions

6. Preserve all MathJax, LaTeX, HTML, and Maxima syntax exactly.

7. Preserve all brackets, commas, quotation marks, and semicolons correctly.
   Carefully check for:
   - mismatched brackets
   - missing commas
   - missing quotation marks
   - broken `sconcat(...)`
   - missing `[` or `]`

8. If the input Japanese text contains `__SELTYPE__`,
   keep it exactly as `__SELTYPE__`
   and make each translated sentence grammatically compatible with it.

9. If the input does NOT contain `__SELTYPE__`,
   do NOT introduce it.

10. Output ONLY a valid Maxima multilingual array in the following order:

```maxima
[
["en", ...],
["fr", ...],
["de", ...],
["it", ...],
["ja", ...]
];
```

11. Before outputting, verify carefully that:
   - all variable names preserve capitalization exactly,
   - all brackets are balanced,
   - the result is syntactically valid Maxima code.

### Input

```maxima
(PLACE YOUR STACK/MAXIMA CODE HERE)
```

