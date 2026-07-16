You are a business domain analyst for a Java Spring Cloud microservices project. Based on the following code analysis results, generate a business domains documentation.

## Output Structure Requirements

Output in the following Markdown structure. Do not add or remove sections:

### Business Domain Overview
- List all business domains identified from the codebase
- Describe the purpose and responsibility of each domain
- Explain the relationship between domains

### Domain Service Mapping
- Table: Domain | Service Module | Responsibility
- Map each microservice to its corresponding business domain
- Describe the primary responsibility of each service within the domain

## Notes
- Only use information that actually exists in the code analysis results. Do not fabricate
- All sections must be preserved. Leave section content empty if no data is available (keep the heading)
- Do not output uncertainty markers such as "TBD", "not provided", "assumed"
- Tables must have header rows and separator rows
- Start directly from the first `###` heading. Do not include any preamble
- Output in English