# Get Collection Details

GET https://api.webflow.com/v2/collections/{collection_id}

Get the full details of a collection from its ID.

Required scope | `cms:read`


Reference: https://developers.webflow.com/data/reference/cms/collections/get

## OpenAPI Specification

```yaml
openapi: 3.1.1
info:
  title: Get Collection Details
  version: endpoint_collections.get
paths:
  /collections/{collection_id}:
    get:
      operationId: get
      summary: Get Collection Details
      description: |
        Get the full details of a collection from its ID.

        Required scope | `cms:read`
      tags:
        - - subpackage_collections
      parameters:
        - name: collection_id
          in: path
          description: Unique identifier for a Collection
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
                $ref: '#/components/schemas/collections_get_Response_200'
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
    CollectionsCollectionIdGetResponsesContentApplicationJsonSchemaFieldsItemsType:
      type: string
      enum:
        - value: Color
        - value: DateTime
        - value: Email
        - value: ExtFileRef
        - value: File
        - value: Image
        - value: Link
        - value: MultiImage
        - value: MultiReference
        - value: Number
        - value: Option
        - value: Phone
        - value: PlainText
        - value: Reference
        - value: RichText
        - value: Switch
        - value: VideoLink
    CollectionsCollectionIdGetResponsesContentApplicationJsonSchemaFieldsItemsValidationsAdditionalProperties:
      oneOf:
        - type: string
        - type: number
          format: double
        - type: boolean
        - type: integer
        - type: object
          additionalProperties:
            description: Any type
    CollectionsCollectionIdGetResponsesContentApplicationJsonSchemaFieldsItemsValidations:
      type: object
      properties:
        additionalProperties:
          $ref: >-
            #/components/schemas/CollectionsCollectionIdGetResponsesContentApplicationJsonSchemaFieldsItemsValidationsAdditionalProperties
    CollectionsCollectionIdGetResponsesContentApplicationJsonSchemaFieldsItems:
      type: object
      properties:
        id:
          type: string
          format: objectid
          description: Unique identifier for a Field
        isRequired:
          type: boolean
          description: define whether a field is required in a collection
        isEditable:
          type: boolean
          description: Define whether the field is editable
        type:
          $ref: >-
            #/components/schemas/CollectionsCollectionIdGetResponsesContentApplicationJsonSchemaFieldsItemsType
          description: Choose these appropriate field type for your collection data
        slug:
          type: string
          description: >-
            Slug of Field in Site URL structure. Slugs should be all lowercase
            with no spaces. Any spaces will be converted to "-."
        displayName:
          type: string
          description: The name of a field
        helpText:
          type: string
          description: Additional text to help anyone filling out this field
        validations:
          oneOf:
            - $ref: >-
                #/components/schemas/CollectionsCollectionIdGetResponsesContentApplicationJsonSchemaFieldsItemsValidations
            - type: 'null'
          description: The validations for the field
      required:
        - id
        - isRequired
        - type
        - displayName
    collections_get_Response_200:
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
        fields:
          type: array
          items:
            $ref: >-
              #/components/schemas/CollectionsCollectionIdGetResponsesContentApplicationJsonSchemaFieldsItems
          description: The list of fields in the Collection
      required:
        - id
        - displayName
        - singularName
        - fields

```

## SDK Code Examples

```python
from webflow import Webflow

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.collections.get(
    collection_id="580e63fc8c9a982ac9b8b745",
)

```

```typescript
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.collections.get("580e63fc8c9a982ac9b8b745");

```

```go
package main

import (
	"fmt"
	"net/http"
	"io"
)

func main() {

	url := "https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745"

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

url = URI("https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Get.new(url)
request["Authorization"] = 'Bearer <token>'

response = http.request(request)
puts response.read_body
```

```java
HttpResponse<String> response = Unirest.get("https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745")
  .header("Authorization", "Bearer <token>")
  .asString();
```

```php
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('GET', 'https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745', [
  'headers' => [
    'Authorization' => 'Bearer <token>',
  ],
]);

echo $response->getBody();
```

```csharp
var client = new RestClient("https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745");
var request = new RestRequest(Method.GET);
request.AddHeader("Authorization", "Bearer <token>");
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = ["Authorization": "Bearer <token>"]

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745")! as URL,
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