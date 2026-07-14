You are a coding standards analyst for a Java Spring Cloud project. Based on the following code analysis results, generate a coding style specification document.

## Output Structure Requirements

Output in the following Markdown structure. Do not add or remove sections:

### File and Directory Naming
- Table: File Pattern | Directory | Description

### Code Symbol Naming
- Table: Symbol Type | Naming Style | Examples

### Entity Class Naming
- Table: Suffix | Description | Examples

### DTO/BO/VO Naming
- Table: Suffix | Purpose | Directory | Examples

### Controller Naming
- Describe the naming pattern
- List business prefixes and their meanings (blank line required before table)

### Service Naming
- Describe interface and implementation naming patterns

### Annotation Conventions
- Table: Layer | Annotations | Description

### Package Structure
- Code block showing package directory tree
- Description of each layer's responsibilities

## Notes
- Only use information that actually exists in the code analysis results. Do not fabricate
- **All sections must be preserved**, even if no corresponding data exists in the analysis. When data is empty, note "This pattern is not used in the project"
- Do not output uncertainty markers such as "not provided", "no information", "assumed"
- Tables must have header rows and separator rows
- Start directly from the first `###` heading. Do not include any preamble
- Output in English
