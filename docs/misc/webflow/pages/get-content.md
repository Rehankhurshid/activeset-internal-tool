# Get Page Content

GET https://api.webflow.com/v2/pages/{page_id}/dom

Get text and component instance content from a static page.

<Badge intent="info">Localization</Badge> 

Required scope | `pages:read`


Reference: https://developers.webflow.com/data/reference/pages-and-components/pages/get-content

## OpenAPI Specification

```yaml
openapi: 3.1.1
info:
  title: Get Page Content
  version: endpoint_pages.get-content
paths:
  /pages/{page_id}/dom:
    get:
      operationId: get-content
      summary: Get Page Content
      description: |
        Get text and component instance content from a static page.

        <Badge intent="info">Localization</Badge> 

        Required scope | `pages:read`
      tags:
        - - subpackage_pages
      parameters:
        - name: page_id
          in: path
          description: Unique identifier for a Page
          required: true
          schema:
            type: string
            format: objectid
        - name: localeId
          in: query
          description: >
            Unique identifier for a specific Locale.


            [Lear more about
            localization.](/data/v2.0.0/docs/working-with-localization)
          required: false
          schema:
            type: string
        - name: limit
          in: query
          description: 'Maximum number of records to be returned (max limit: 100)'
          required: false
          schema:
            type: number
            format: double
        - name: offset
          in: query
          description: >-
            Offset used for pagination if the results have more than limit
            records
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
                $ref: '#/components/schemas/pages_get-content_Response_200'
        '400':
          description: Request body was incorrectly formatted.
          content: {}
        '401':
          description: >-
            Provided access token is invalid or does not have access to
            requested resource
          content: {}
        '403':
          description: Forbidden
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
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf0Type:
      type: string
      enum:
        - value: text
      default: text
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf0Text:
      type: object
      properties:
        html:
          type:
            - string
            - 'null'
          description: The HTML content of the text node.
        text:
          type:
            - string
            - 'null'
          description: The raw text content of the text node.
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems0:
      type: object
      properties:
        id:
          type: string
          description: Node UUID
        type:
          $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf0Type
          description: The type of the node
        text:
          $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf0Text
          description: The text content of the node
        attributes:
          type: object
          additionalProperties:
            type: string
          description: The custom attributes of the node
      required:
        - id
        - type
        - text
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf1Type:
      type: string
      enum:
        - value: image
      default: image
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf1Image:
      type: object
      properties:
        alt:
          type:
            - string
            - 'null'
        assetId:
          type: string
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems1:
      type: object
      properties:
        id:
          type: string
          description: Node UUID
        type:
          $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf1Type
          description: The type of the node
        image:
          $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf1Image
          description: The image details of the node
        attributes:
          type: object
          additionalProperties:
            type: string
          description: The custom attributes of the node
      required:
        - id
        - type
        - image
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf2Type:
      type: string
      enum:
        - value: component-instance
      default: component-instance
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf2PropertyOverridesItemsType:
      type: string
      enum:
        - value: Plain Text
        - value: Rich Text
        - value: Alt Text
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf2PropertyOverridesItemsText:
      type: object
      properties:
        html:
          type:
            - string
            - 'null'
          description: The HTML content of the text node.
        text:
          type:
            - string
            - 'null'
          description: The raw text content of the text node.
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf2PropertyOverridesItems:
      type: object
      properties:
        propertyId:
          type: string
          description: The ID of the property.
        type:
          $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf2PropertyOverridesItemsType
          description: The type of the property.
        label:
          type: string
          description: The label of the property in the UI.
        text:
          $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf2PropertyOverridesItemsText
          description: >-
            Represents text content within the DOM. It contains both the raw
            text and its HTML representation.
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems2:
      type: object
      properties:
        id:
          type: string
          description: The unique identifier of the component instance node
        type:
          $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf2Type
          description: The type of the node
        componentId:
          type: string
          description: The unique identifier of the component
        propertyOverrides:
          type: array
          items:
            $ref: >-
              #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf2PropertyOverridesItems
          description: >-
            List of component properties with overrides for a component
            instance.
      required:
        - id
        - type
        - componentId
        - propertyOverrides
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf3Type:
      type: string
      enum:
        - value: text-input
      default: text-input
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems3:
      type: object
      properties:
        id:
          type: string
          description: Node UUID
        type:
          $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf3Type
          description: The type of the node
        placeholder:
          type: string
          description: The placeholder text of the input node
        attributes:
          type: object
          additionalProperties:
            type: string
          description: The custom attributes of the node
      required:
        - id
        - type
        - placeholder
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf4Type:
      type: string
      enum:
        - value: select
      default: select
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf4ChoicesItems:
      type: object
      properties:
        value:
          type: string
          description: The value of the choice when selected.
        text:
          type: string
          description: The text to display for the choice.
      required:
        - value
        - text
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems4:
      type: object
      properties:
        id:
          type: string
          description: Node UUID
        type:
          $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf4Type
          description: The type of the node
        choices:
          type: array
          items:
            $ref: >-
              #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf4ChoicesItems
          description: The list of choices in this select node.
        attributes:
          type: object
          additionalProperties:
            type: string
          description: The custom attributes of the node
      required:
        - id
        - type
        - choices
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf5Type:
      type: string
      enum:
        - value: submit-button
      default: submit-button
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems5:
      type: object
      properties:
        id:
          type: string
          description: Node UUID
        type:
          $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf5Type
          description: The type of the node
        value:
          type: string
          description: The text content of the submit button.
        waitingText:
          type: string
          description: The text to show while the form is submitting.
        attributes:
          type: object
          additionalProperties:
            type: string
          description: The custom attributes of the node
      required:
        - id
        - type
        - value
        - waitingText
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf6Type:
      type: string
      enum:
        - value: search-button
      default: search-button
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems6:
      type: object
      properties:
        id:
          type: string
          description: Node UUID
        type:
          $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItemsOneOf6Type
          description: The type of the node
        value:
          type: string
          description: The text content of the search button.
        attributes:
          type: object
          additionalProperties:
            type: string
          description: The custom attributes of the node
      required:
        - id
        - type
        - value
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems:
      oneOf:
        - $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems0
        - $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems1
        - $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems2
        - $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems3
        - $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems4
        - $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems5
        - $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems6
    PagesPageIdDomGetResponsesContentApplicationJsonSchemaPagination:
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
    pages_get-content_Response_200:
      type: object
      properties:
        pageId:
          type: string
          description: Page ID
        branchId:
          type:
            - string
            - 'null'
          format: objectid
          description: >-
            The unique identifier of a [specific page
            branch.](https://help.webflow.com/hc/en-us/articles/33961355506195-Page-branching)
        nodes:
          type: array
          items:
            $ref: >-
              #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaNodesItems
        pagination:
          $ref: >-
            #/components/schemas/PagesPageIdDomGetResponsesContentApplicationJsonSchemaPagination
          description: Pagination object
        lastUpdated:
          type:
            - string
            - 'null'
          format: date-time
          description: The date the page dom was most recently updated

```

## SDK Code Examples

```python
from webflow import Webflow

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.pages.get_content(
    page_id="63c720f9347c2139b248e552",
    locale_id="65427cf400e02b306eaa04a0",
    limit=1.1,
    offset=1.1,
)

```

```typescript
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.pages.getContent("63c720f9347c2139b248e552", {
    localeId: "65427cf400e02b306eaa04a0",
    limit: 1.1,
    offset: 1.1
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

	url := "https://api.webflow.com/v2/pages/63c720f9347c2139b248e552/dom?localeId=65427cf400e02b306eaa04a0&limit=100&offset=0"

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

url = URI("https://api.webflow.com/v2/pages/63c720f9347c2139b248e552/dom?localeId=65427cf400e02b306eaa04a0&limit=100&offset=0")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Get.new(url)
request["Authorization"] = 'Bearer <token>'

response = http.request(request)
puts response.read_body
```

```java
HttpResponse<String> response = Unirest.get("https://api.webflow.com/v2/pages/63c720f9347c2139b248e552/dom?localeId=65427cf400e02b306eaa04a0&limit=100&offset=0")
  .header("Authorization", "Bearer <token>")
  .asString();
```

```php
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('GET', 'https://api.webflow.com/v2/pages/63c720f9347c2139b248e552/dom?localeId=65427cf400e02b306eaa04a0&limit=100&offset=0', [
  'headers' => [
    'Authorization' => 'Bearer <token>',
  ],
]);

echo $response->getBody();
```

```csharp
var client = new RestClient("https://api.webflow.com/v2/pages/63c720f9347c2139b248e552/dom?localeId=65427cf400e02b306eaa04a0&limit=100&offset=0");
var request = new RestRequest(Method.GET);
request.AddHeader("Authorization", "Bearer <token>");
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = ["Authorization": "Bearer <token>"]

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/pages/63c720f9347c2139b248e552/dom?localeId=65427cf400e02b306eaa04a0&limit=100&offset=0")! as URL,
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