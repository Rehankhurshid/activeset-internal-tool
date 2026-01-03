# List Collections

GET https://api.webflow.com/v2/sites/{site_id}/collections

List of all Collections within a Site.

Required scope | `cms:read`


Reference: https://developers.webflow.com/data/reference/cms/collections/list

## OpenAPI Specification

```yaml
openapi: 3.1.1
info:
  title: List Collections
  version: endpoint_collections.list
paths:
  /sites/{site_id}/collections:
    get:
      operationId: list
      summary: List Collections
      description: |
        List of all Collections within a Site.

        Required scope | `cms:read`
      tags:
        - - subpackage_collections
      parameters:
        - name: site_id
          in: path
          description: Unique identifier for a Site
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
        '200':
          description: Request was successful
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/collections_list_Response_200'
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
    SitesSiteIdCollectionsGetResponsesContentApplicationJsonSchemaCollectionsItems:
      type: object
      properties:
        id:
          type: string
          format: objectid
          description: Unique identifier for a Collection
        displayName:
          type: string
          description: Name given to the Collection
        singularName:
          type: string
          description: >-
            The name of one Item in Collection (e.g. ”Blog Post” if the
            Collection is called “Blog Posts”)
        slug:
          type: string
          description: Slug of Collection in Site URL structure
        createdOn:
          type: string
          format: date-time
          description: The date the collection was created
        lastUpdated:
          type: string
          format: date-time
          description: The date the collection was last updated
      required:
        - id
    collections_list_Response_200:
      type: object
      properties:
        collections:
          type: array
          items:
            $ref: >-
              #/components/schemas/SitesSiteIdCollectionsGetResponsesContentApplicationJsonSchemaCollectionsItems
          description: An array of Collections

```

## SDK Code Examples

```python
from webflow import Webflow

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.collections.list(
    site_id="580e63e98c9a982ac9b8b741",
)

```

```typescript
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.collections.list("580e63e98c9a982ac9b8b741");

```

```go
package main

import (
	"fmt"
	"net/http"
	"io"
)

func main() {

	url := "https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/collections"

	req, _ := http.NewRequest("GET", url, nil)

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

url = URI("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/collections")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Get.new(url)
request["Authorization"] = 'Bearer <token>'

response = http.request(request)
puts response.read_body
```

```java
HttpResponse<String> response = Unirest.get("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/collections")
  .header("Authorization", "Bearer <token>")
  .asString();
```

```php
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('GET', 'https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/collections', [
  'headers' => [
    'Authorization' => 'Bearer <token>',
  ],
]);

echo $response->getBody();
```

```csharp
var client = new RestClient("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/collections");
var request = new RestRequest(Method.GET);
request.AddHeader("Authorization", "Bearer <token>");
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = ["Authorization": "Bearer <token>"]

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/collections")! as URL,
                                        cachePolicy: .useProtocolCachePolicy,
                                    timeoutInterval: 10.0)
request.httpMethod = "GET"
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