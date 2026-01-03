# List Asset Folders

GET https://api.webflow.com/v2/sites/{site_id}/asset_folders

List Asset Folders within a given site

Required scope | `assets:read`


Reference: https://developers.webflow.com/data/reference/assets/asset-folders/list-folders

## OpenAPI Specification

```yaml
openapi: 3.1.1
info:
  title: List Asset Folders
  version: endpoint_assets.list-folders
paths:
  /sites/{site_id}/asset_folders:
    get:
      operationId: list-folders
      summary: List Asset Folders
      description: |
        List Asset Folders within a given site

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
                $ref: '#/components/schemas/assets_list-folders_Response_200'
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
    SitesSiteIdAssetFoldersGetResponsesContentApplicationJsonSchemaAssetFoldersItems:
      type: object
      properties:
        id:
          type: string
          format: objectid
          description: Unique identifier for the Asset Folder
        displayName:
          type: string
          description: User visible name for the Asset Folder
        parentFolder:
          type: string
          description: Pointer to parent Asset Folder (or null if root)
        assets:
          type: array
          items:
            type: string
            format: objectid
          description: Array of Asset instances in the folder
        siteId:
          type: string
          format: objectid
          description: The unique ID of the site the Asset Folder belongs to
        createdOn:
          type: string
          format: date-time
          description: Date that the Asset Folder was created on
        lastUpdated:
          type: string
          format: date-time
          description: Date that the Asset Folder was last updated on
    SitesSiteIdAssetFoldersGetResponsesContentApplicationJsonSchemaPagination:
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
    assets_list-folders_Response_200:
      type: object
      properties:
        assetFolders:
          type: array
          items:
            $ref: >-
              #/components/schemas/SitesSiteIdAssetFoldersGetResponsesContentApplicationJsonSchemaAssetFoldersItems
          description: A list of Asset folders
        pagination:
          $ref: >-
            #/components/schemas/SitesSiteIdAssetFoldersGetResponsesContentApplicationJsonSchemaPagination
          description: Pagination object

```

## SDK Code Examples

```python
from webflow import Webflow

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.assets.list_folders(
    site_id="580e63e98c9a982ac9b8b741",
)

```

```typescript
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.assets.listFolders("580e63e98c9a982ac9b8b741");

```

```go
package main

import (
	"fmt"
	"net/http"
	"io"
)

func main() {

	url := "https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/asset_folders"

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

url = URI("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/asset_folders")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Get.new(url)
request["Authorization"] = 'Bearer <token>'

response = http.request(request)
puts response.read_body
```

```java
HttpResponse<String> response = Unirest.get("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/asset_folders")
  .header("Authorization", "Bearer <token>")
  .asString();
```

```php
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('GET', 'https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/asset_folders', [
  'headers' => [
    'Authorization' => 'Bearer <token>',
  ],
]);

echo $response->getBody();
```

```csharp
var client = new RestClient("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/asset_folders");
var request = new RestRequest(Method.GET);
request.AddHeader("Authorization", "Bearer <token>");
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = ["Authorization": "Bearer <token>"]

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/asset_folders")! as URL,
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