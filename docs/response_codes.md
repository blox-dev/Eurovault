# Responses

## Metadata

Fields:
```javascript
{code, status, id, message, reason?, data?, userAction?}
```

### Success - 0xx

- status: "success", id: 0, message: "Fetched metadata"

### Warning - 1xx

- status: "warning", id: 100, message: "ASYNCHRONOUS_RESPONSE"

### Error - 2xx

- status: "error", id: 200, message: "Metadata error", reason: "Metadata not fetched"

- status: "error", id: 201, message: "Unhandled Eurostat error"

- status: "error", id: 210, message: "Error while fixing EXTRACTION_TOO_BIG"

## Data

Fields:
```javascript
{code, status, id, message, reason?, csv?, json?}
```

### Success - 3xx

- status: "success", id: 300, message: "Fetched data"

- status: "success", id: 302, message: "No update", reason: "Data updated less than 30 days ago"

### Warning - 4xx


### Error - 5xx


- status: "error", id: 500, message: "Metadata error", reason: "Metadata not fetched"

- status: "error", id: 501, message: "Failed to fetch data", reason: data.error

- status: "error", id: 599, message: "Metadata error", reason: "Something is very wrong with the metadata"