# Create Asset Folder

POST https://api.webflow.com/v2/sites/{site_id}/asset_folders
Content-Type: application/json

Create an Asset Folder within a given site

Required scope | `assets:write`


Reference: https://developers.webflow.com/data/reference/assets/asset-folders/create-folder

## OpenAPI Specification

```yaml
openapi: 3.1.1
info:
  title: Create Asset Folder
  version: endpoint_assets.create-folder
paths:
  /sites/{site_id}/asset_folders:
    post:
      operationId: create-folder
      summary: Create Asset Folder
      description: |
        Create an Asset Folder within a given site

        Required scope | `assets:write`
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
                $ref: '#/components/schemas/assets_create-folder_Response_200'
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
        content:
          application/json:
            schema:
              type: object
              properties:
                displayName:
                  type: string
                  description: A human readable name for the Asset Folder
                parentFolder:
                  type: string
                  description: >-
                    An (optional) pointer to a parent Asset Folder (or null for
                    root)
              required:
                - displayName
components:
  schemas:
    assets_create-folder_Response_200:
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

```

## SDK Code Examples

```python
from webflow import Webflow

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.assets.create_folder(
    site_id="580e63e98c9a982ac9b8b741",
    display_name="my asset folder",
)

```

```typescript
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.assets.createFolder("580e63e98c9a982ac9b8b741", {
    displayName: "my asset folder"
});

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

	url := "https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/asset_folders"

	payload := strings.NewReader("{\n  \"displayName\": \"my asset folder\"\n}")

	req, _ := http.NewRequest("POST", url, payload)

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

url = URI("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/asset_folders")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Post.new(url)
request["Authorization"] = 'Bearer <token>'
request["Content-Type"] = 'application/json'
request.body = "{\n  \"displayName\": \"my asset folder\"\n}"

response = http.request(request)
puts response.read_body
```

```java
HttpResponse<String> response = Unirest.post("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/asset_folders")
  .header("Authorization", "Bearer <token>")
  .header("Content-Type", "application/json")
  .body("{\n  \"displayName\": \"my asset folder\"\n}")
  .asString();
```

```php
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('POST', 'https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/asset_folders', [
  'body' => '{
  "displayName": "my asset folder"
}',
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Content-Type' => 'application/json',
  ],
]);

echo $response->getBody();
```

```csharp
var client = new RestClient("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/asset_folders");
var request = new RestRequest(Method.POST);
request.AddHeader("Authorization", "Bearer <token>");
request.AddHeader("Content-Type", "application/json");
request.AddParameter("application/json", "{\n  \"displayName\": \"my asset folder\"\n}", ParameterType.RequestBody);
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = [
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
]
let parameters = ["displayName": "my asset folder"] as [String : Any]

let postData = JSONSerialization.data(withJSONObject: parameters, options: [])

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/asset_folders")! as URL,
                                        cachePolicy: .useProtocolCachePolicy,
                                    timeoutInterval: 10.0)
request.httpMethod = "POST"
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