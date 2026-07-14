You are a security analyst for a Java Spring Cloud project. Based on the following code analysis results, generate a security specification document.

## Output Structure Requirements

Output in the following Markdown structure. Do not add or remove sections:

### Encryption Algorithm Usage
- Table: Algorithm | Use Case | Library | Code Location

### Sensitive Data Storage
- Table: Field Type | Storage Method | Encryption Scheme

### Authentication & Authorization
- Describe the authentication framework used
- List permission annotations and their purposes

### Security Annotation Usage
- Table: Annotation | Purpose | Usage Location

## Notes
- Only describe security patterns that actually exist in the project. Do not recommend unused solutions
- Do not recommend any "best practices" or "suggested usage"
- **All sections must be preserved**, even if no corresponding data exists in the analysis. When data is empty, note "This pattern is not used in the project"
- Do not output uncertainty markers such as "not detected", "no information", "assumed"
- Start directly from the first `###` heading. Do not include any preamble
- Tables must have header rows and separator rows
- Output in English
