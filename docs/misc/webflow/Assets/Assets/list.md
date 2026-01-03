# List Assets

GET https://api.webflow.com/v2/sites/{site_id}/assets

List of assets uploaded to a site

Required scope | `assets:read`


Reference: https://developers.webflow.com/data/reference/assets/assets/list

## OpenAPI Specification

```yaml
openapi: 3.1.1
info:
  title: List Assets
  version: endpoint_assets.list
paths:
  /sites/{site_id}/assets:
    get:
      operationId: list
      summary: List Assets
      description: |
        List of assets uploaded to a site

        Required scope | `assets:read`
      tags:
        - - subpackage_assets
      parameters:
        - name: site_id
          in: path
          description: Unique identifier for a Site
          required: true
          schema:
            type: string
            format: objectid
        - name: offset
          in: query
          description: >-
            Offset used for pagination if the results have more than limit
            records
          required: false
          schema:
            type: number
            format: double
        - name: limit
          in: query
          description: 'Maximum number of records to be returned (max limit: 100)'
          required: false
          schema:
            type: number
            format: double
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
                $ref: '#/components/schemas/assets_list_Response_200'
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
    SitesSiteIdAssetsGetResponsesContentApplicationJsonSchemaAssetsItemsVariantsItems:
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
    SitesSiteIdAssetsGetResponsesContentApplicationJsonSchemaAssetsItems:
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
              #/components/schemas/SitesSiteIdAssetsGetResponsesContentApplicationJsonSchemaAssetsItemsVariantsItems
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
    SitesSiteIdAssetsGetResponsesContentApplicationJsonSchemaPagination:
      type: object
      properties:
        limit:
          type: number
          format: double
          description: The limit used for pagination
        offset:
          type: number
          format: double
          description: The offset used for pagination
        total:
          type: number
          format: double
          description: The total number of records
      required:
        - limit
        - offset
        - total
    assets_list_Response_200:
      type: object
      properties:
        assets:
          type: array
          items:
            $ref: >-
              #/components/schemas/SitesSiteIdAssetsGetResponsesContentApplicationJsonSchemaAssetsItems
        pagination:
          $ref: >-
            #/components/schemas/SitesSiteIdAssetsGetResponsesContentApplicationJsonSchemaPagination
          description: Pagination object
      required:
        - assets
        - pagination

```

## SDK Code Examples

```python
from webflow import Webflow

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.assets.list(
    site_id="580e63e98c9a982ac9b8b741",
    offset=1.1,
    limit=1.1,
)

```

```typescript
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.assets.list("580e63e98c9a982ac9b8b741", {
    offset: 1.1,
    limit: 1.1
});

```

```go
package main

import (
	"fmt"
	"net/http"
	"io"
)

func main() {

	url := "https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/assets?offset=0&limit=100"

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

url = URI("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/assets?offset=0&limit=100")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Get.new(url)
request["Authorization"] = 'Bearer <token>'

response = http.request(request)
puts response.read_body
```

```java
HttpResponse<String> response = Unirest.get("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/assets?offset=0&limit=100")
  .header("Authorization", "Bearer <token>")
  .asString();
```

```php
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('GET', 'https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/assets?offset=0&limit=100', [
  'headers' => [
    'Authorization' => 'Bearer <token>',
  ],
]);

echo $response->getBody();
```

```csharp
var client = new RestClient("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/assets?offset=0&limit=100");
var request = new RestRequest(Method.GET);
request.AddHeader("Authorization", "Bearer <token>");
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = ["Authorization": "Bearer <token>"]

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/assets?offset=0&limit=100")! as URL,
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