# Update Asset

PATCH https://api.webflow.com/v2/assets/{asset_id}
Content-Type: application/json

Update details of an Asset.

Required scope | `assets:write`


Reference: https://developers.webflow.com/data/reference/assets/assets/update

## OpenAPI Specification

```yaml
openapi: 3.1.1
info:
  title: Update Asset
  version: endpoint_assets.update
paths:
  /assets/{asset_id}:
    patch:
      operationId: update
      summary: Update Asset
      description: |
        Update details of an Asset.

        Required scope | `assets:write`
      tags:
        - - subpackage_assets
      parameters:
        - name: asset_id
          in: path
          description: Unique identifier for an Asset on a site
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
                $ref: '#/components/schemas/assets_update_Response_200'
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
      requestBody:
        description: Information about the asset to update
        content:
          application/json:
            schema:
              type: object
              properties:
                localeId:
                  type: string
                  description: >-
                    Unique identifier for a specific locale. Applicable, when
                    using localization.
                displayName:
                  type: string
                  description: A human readable name for the asset
components:
  schemas:
    AssetsAssetIdPatchResponsesContentApplicationJsonSchemaVariantsItems:
      type: object
      properties:
        hostedUrl:
          type: string
          format: uri
          description: URL of where the asset variant is hosted
        originalFileName:
          type: string
          description: Original file name of the variant
        displayName:
          type: string
          description: Display name of the variant
        format:
          type: string
          description: format of the variant
        width:
          type: integer
          description: Width in pixels
        height:
          type:
            - integer
            - 'null'
          description: Height in pixels
        quality:
          type: integer
          description: Value between 0 and 100 representing the image quality
        error:
          type:
            - string
            - 'null'
          description: Any associated validation errors
      required:
        - hostedUrl
        - originalFileName
        - displayName
        - format
        - width
        - height
        - quality
    assets_update_Response_200:
      type: object
      properties:
        id:
          type: string
          format: objectid
          description: Unique identifier for this asset
        contentType:
          type: string
          format: mime-type
          description: File format type
        size:
          type: integer
          description: size in bytes
        siteId:
          type: string
          format: objectid
          description: Unique identifier for the site that hosts this asset
        hostedUrl:
          type: string
          format: uri
          description: Link to the asset
        originalFileName:
          type: string
          description: Original file name at the time of upload
        displayName:
          type: string
          description: Display name of the asset
        lastUpdated:
          type: string
          format: date-time
          description: Date the asset metadata was last updated
        createdOn:
          type: string
          format: date-time
          description: Date the asset metadata was created
        variants:
          type: array
          items:
            $ref: >-
              #/components/schemas/AssetsAssetIdPatchResponsesContentApplicationJsonSchemaVariantsItems
          description: >-
            A list of [asset
            variants](https://help.webflow.com/hc/en-us/articles/33961378697107-Responsive-images)
            created by Webflow to serve your site responsively.
        altText:
          type:
            - string
            - 'null'
          description: The visual description of the asset
      required:
        - id
        - contentType
        - size
        - siteId
        - hostedUrl
        - originalFileName
        - displayName
        - lastUpdated
        - createdOn
        - variants
        - altText

```

## SDK Code Examples

```python
from webflow import Webflow

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.assets.update(
    asset_id="580e63fc8c9a982ac9b8b745",
)

```

```typescript
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.assets.update("580e63fc8c9a982ac9b8b745");

```

```go
package main

import (
	"fmt"
	"strings"
	"net/http"
	"io"
)

func main() {

	url := "https://api.webflow.com/v2/assets/580e63fc8c9a982ac9b8b745"

	payload := strings.NewReader("{}")

	req, _ := http.NewRequest("PATCH", url, payload)

	req.Header.Add("Authorization", "Bearer <token>")
	req.Header.Add("Content-Type", "application/json")

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

url = URI("https://api.webflow.com/v2/assets/580e63fc8c9a982ac9b8b745")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Patch.new(url)
request["Authorization"] = 'Bearer <token>'
request["Content-Type"] = 'application/json'
request.body = "{}"

response = http.request(request)
puts response.read_body
```

```java
HttpResponse<String> response = Unirest.patch("https://api.webflow.com/v2/assets/580e63fc8c9a982ac9b8b745")
  .header("Authorization", "Bearer <token>")
  .header("Content-Type", "application/json")
  .body("{}")
  .asString();
```

```php
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('PATCH', 'https://api.webflow.com/v2/assets/580e63fc8c9a982ac9b8b745', [
  'body' => '{}',
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Content-Type' => 'application/json',
  ],
]);

echo $response->getBody();
```

```csharp
var client = new RestClient("https://api.webflow.com/v2/assets/580e63fc8c9a982ac9b8b745");
var request = new RestRequest(Method.PATCH);
request.AddHeader("Authorization", "Bearer <token>");
request.AddHeader("Content-Type", "application/json");
request.AddParameter("application/json", "{}", ParameterType.RequestBody);
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = [
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
]
let parameters = [] as [String : Any]

let postData = JSONSerialization.data(withJSONObject: parameters, options: [])

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/assets/580e63fc8c9a982ac9b8b745")! as URL,
                                        cachePolicy: .useProtocolCachePolicy,
                                    timeoutInterval: 10.0)
request.httpMethod = "PATCH"
request.allHTTPHeaderFields = headers
request.httpBody = postData as Data

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