# Upload Asset

POST https://api.webflow.com/v2/sites/{site_id}/assets
Content-Type: application/json

The first step in uploading an asset to a site. 


This endpoint generates a response with the following information: `uploadUrl` and `uploadDetails`.


Use these properties in the header of a [POST request to Amazson s3](https://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectPOST.html) to complete the upload.


To learn more about how to upload assets to Webflow, see our [assets guide](/data/docs/working-with-assets).
  
 Required scope | `assets:write`


Reference: https://developers.webflow.com/data/reference/assets/assets/create

## OpenAPI Specification

```yaml
openapi: 3.1.1
info:
  title: Upload Asset
  version: endpoint_assets.create
paths:
  /sites/{site_id}/assets:
    post:
      operationId: create
      summary: Upload Asset
      description: >
        The first step in uploading an asset to a site. 



        This endpoint generates a response with the following information:
        `uploadUrl` and `uploadDetails`.



        Use these properties in the header of a [POST request to Amazson
        s3](https://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectPOST.html)
        to complete the upload.



        To learn more about how to upload assets to Webflow, see our [assets
        guide](/data/docs/working-with-assets).
          
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
                $ref: '#/components/schemas/assets_create_Response_200'
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
        description: Information about the asset to create
        content:
          application/json:
            schema:
              type: object
              properties:
                fileName:
                  type: string
                  description: >-
                    File name including file extension. File names must be less
                    than 100 characters.
                fileHash:
                  type: string
                  description: MD5 hash of the file
                parentFolder:
                  type: string
                  description: ID of the Asset folder (optional)
              required:
                - fileName
                - fileHash
components:
  schemas:
    SitesSiteIdAssetsPostResponsesContentApplicationJsonSchemaUploadDetails:
      type: object
      properties:
        acl:
          type: string
        bucket:
          type: string
        X-Amz-Algorithm:
          type: string
        X-Amz-Credential:
          type: string
        X-Amz-Date:
          type: string
        key:
          type: string
        Policy:
          type: string
        X-Amz-Signature:
          type: string
        success_action_status:
          type: string
        content-type:
          type: string
          format: mime-type
        Cache-Control:
          type: string
    assets_create_Response_200:
      type: object
      properties:
        uploadDetails:
          $ref: >-
            #/components/schemas/SitesSiteIdAssetsPostResponsesContentApplicationJsonSchemaUploadDetails
          description: Metadata for uploading the asset binary
        contentType:
          type: string
        id:
          type: string
          format: objectid
        parentFolder:
          type: string
          format: objectid
          description: Parent folder for the asset
        uploadUrl:
          type: string
          format: uri
        assetUrl:
          type: string
          format: uri
          description: S3 link to the asset
        hostedUrl:
          type: string
          format: uri
          description: Represents the link to the asset
        originalFileName:
          type: string
          description: >-
            Original file name when uploaded. If not specified at time of
            upload, it may be extracted from the raw file name
        createdOn:
          type: string
          format: date-time
          description: Date the asset metadata was created
        lastUpdated:
          type: string
          format: date-time
          description: Date the asset metadata was last updated

```

## SDK Code Examples

```python
from webflow import Webflow

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.assets.create(
    site_id="580e63e98c9a982ac9b8b741",
    file_name="file.png",
    file_hash="3c7d87c9575702bc3b1e991f4d3c638e",
)

```

```typescript
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.assets.create("580e63e98c9a982ac9b8b741", {
    fileName: "file.png",
    fileHash: "3c7d87c9575702bc3b1e991f4d3c638e"
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

	url := "https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/assets"

	payload := strings.NewReader("{\n  \"fileName\": \"file.png\",\n  \"fileHash\": \"3c7d87c9575702bc3b1e991f4d3c638e\"\n}")

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

url = URI("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/assets")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Post.new(url)
request["Authorization"] = 'Bearer <token>'
request["Content-Type"] = 'application/json'
request.body = "{\n  \"fileName\": \"file.png\",\n  \"fileHash\": \"3c7d87c9575702bc3b1e991f4d3c638e\"\n}"

response = http.request(request)
puts response.read_body
```

```java
HttpResponse<String> response = Unirest.post("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/assets")
  .header("Authorization", "Bearer <token>")
  .header("Content-Type", "application/json")
  .body("{\n  \"fileName\": \"file.png\",\n  \"fileHash\": \"3c7d87c9575702bc3b1e991f4d3c638e\"\n}")
  .asString();
```

```php
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('POST', 'https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/assets', [
  'body' => '{
  "fileName": "file.png",
  "fileHash": "3c7d87c9575702bc3b1e991f4d3c638e"
}',
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Content-Type' => 'application/json',
  ],
]);

echo $response->getBody();
```

```csharp
var client = new RestClient("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/assets");
var request = new RestRequest(Method.POST);
request.AddHeader("Authorization", "Bearer <token>");
request.AddHeader("Content-Type", "application/json");
request.AddParameter("application/json", "{\n  \"fileName\": \"file.png\",\n  \"fileHash\": \"3c7d87c9575702bc3b1e991f4d3c638e\"\n}", ParameterType.RequestBody);
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = [
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
]
let parameters = [
  "fileName": "file.png",
  "fileHash": "3c7d87c9575702bc3b1e991f4d3c638e"
] as [String : Any]

let postData = JSONSerialization.data(withJSONObject: parameters, options: [])

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/assets")! as URL,
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