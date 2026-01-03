# Delete field

DELETE https://api.webflow.com/v2/collections/{collection_id}/fields/{field_id}

Delete a custom field in a collection. This endpoint does not currently support bulk deletion.

Required scope | `cms:write`


Reference: https://developers.webflow.com/data/reference/cms/collection-fields/delete

## OpenAPI Specification

```yaml
openapi: 3.1.1
info:
  title: Delete Collection Field
  version: endpoint_collections/fields.delete
paths:
  /collections/{collection_id}/fields/{field_id}:
    delete:
      operationId: delete
      summary: Delete Collection Field
      description: >
        Delete a custom field in a collection. This endpoint does not currently
        support bulk deletion.


        Required scope | `cms:write`
      tags:
        - - subpackage_collections
          - subpackage_collections/fields
      parameters:
        - name: collection_id
          in: path
          description: Unique identifier for a Collection
          required: true
          schema:
            type: string
            format: objectid
        - name: field_id
          in: path
          description: Unique identifier for a Field in a collection
          required: true
          schema:
            type: string
            format: objectid
        - name: Authorization
          in: header
          description: >-
            Bearer authentication of the form `Bearer <token>`, where token is
            your auth token.
          required: true
          schema:
            type: string
      responses:
        '204':
          description: Request was successful. No Content is returned.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/collections_fields_delete_Response_204'
        '400':
          description: Request body was incorrectly formatted.
          content: {}
        '401':
          description: >-
            Provided access token is invalid or does not have access to
            requested resource
          content: {}
        '404':
          description: Requested resource not found
          content: {}
        '429':
          description: >-
            The rate limit of the provided access_token has been reached. Please
            have your application respect the X-RateLimit-Remaining header we
            include on API responses.
          content: {}
        '500':
          description: We had a problem with our server. Try again later.
          content: {}
components:
  schemas:
    collections_fields_delete_Response_204:
      type: object
      properties: {}

```

## SDK Code Examples

```python
from webflow import Webflow

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.collections.fields.delete(
    collection_id="580e63fc8c9a982ac9b8b745",
    field_id="580e63fc8c9a982ac9b8b745",
)

```

```typescript
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.collections.fields.delete("580e63fc8c9a982ac9b8b745", "580e63fc8c9a982ac9b8b745");

```

```go
package main

import (
	"fmt"
	"net/http"
	"io"
)

func main() {

	url := "https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields/580e63fc8c9a982ac9b8b745"

	req, _ := http.NewRequest("DELETE", url, nil)

	req.Header.Add("Authorization", "Bearer <token>")

	res, _ := http.DefaultClient.Do(req)

	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)

	fmt.Println(res)
	fmt.Println(string(body))

}
```

```ruby
require 'uri'
require 'net/http'

url = URI("https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields/580e63fc8c9a982ac9b8b745")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Delete.new(url)
request["Authorization"] = 'Bearer <token>'

response = http.request(request)
puts response.read_body
```

```java
HttpResponse<String> response = Unirest.delete("https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields/580e63fc8c9a982ac9b8b745")
  .header("Authorization", "Bearer <token>")
  .asString();
```

```php
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('DELETE', 'https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields/580e63fc8c9a982ac9b8b745', [
  'headers' => [
    'Authorization' => 'Bearer <token>',
  ],
]);

echo $response->getBody();
```

```csharp
var client = new RestClient("https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields/580e63fc8c9a982ac9b8b745");
var request = new RestRequest(Method.DELETE);
request.AddHeader("Authorization", "Bearer <token>");
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = ["Authorization": "Bearer <token>"]

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields/580e63fc8c9a982ac9b8b745")! as URL,
                                        cachePolicy: .useProtocolCachePolicy,
                                    timeoutInterval: 10.0)
request.httpMethod = "DELETE"
request.allHTTPHeaderFields = headers

let session = URLSession.shared
let dataTask = session.dataTask(with: request as URLRequest, completionHandler: { (data, response, error) -> Void in
  if (error != nil) {
    print(error as Any)
  } else {
    let httpResponse = response as? HTTPURLResponse
    print(httpResponse)
  }
})

dataTask.resume()
```