# Update Page Content

POST https://api.webflow.com/v2/pages/{page_id}/dom
Content-Type: application/json

This endpoint updates content on a static page in **secondary locales**. It supports updating up to 1000 nodes in a single request.

Before making updates:
1. Use the [get page content](/data/reference/pages-and-components/pages/get-content) endpoint to identify available content nodes and their types.
2. If the page has component instances, retrieve the component's properties that you'll override using the [get component properties](/data/reference/pages-and-components/components/get-properties) endpoint.
3. DOM elements may include a `data-w-id` attribute. This attribute is used by Webflow to maintain custom attributes and links across locales. Always include the original `data-w-id` value in your update requests to ensure consistent behavior across all locales.

<Note>
  This endpoint is specifically for localized pages. Ensure that the specified `localeId` is a valid **secondary locale** for the site otherwise the request will fail.
</Note>

Required scope | `pages:write`


Reference: https://developers.webflow.com/data/reference/pages-and-components/pages/update-static-content

## OpenAPI Specification

```yaml
openapi: 3.1.1
info:
  title: Update Page Content
  version: endpoint_pages.update-static-content
paths:
  /pages/{page_id}/dom:
    post:
      operationId: update-static-content
      summary: Update Page Content
      description: >
        This endpoint updates content on a static page in **secondary locales**.
        It supports updating up to 1000 nodes in a single request.


        Before making updates:

        1. Use the [get page
        content](/data/reference/pages-and-components/pages/get-content)
        endpoint to identify available content nodes and their types.

        2. If the page has component instances, retrieve the component's
        properties that you'll override using the [get component
        properties](/data/reference/pages-and-components/components/get-properties)
        endpoint.

        3. DOM elements may include a `data-w-id` attribute. This attribute is
        used by Webflow to maintain custom attributes and links across locales.
        Always include the original `data-w-id` value in your update requests to
        ensure consistent behavior across all locales.


        <Note>
          This endpoint is specifically for localized pages. Ensure that the specified `localeId` is a valid **secondary locale** for the site otherwise the request will fail.
        </Note>


        Required scope | `pages:write`
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
          description: The locale identifier.
          required: true
          schema:
            type: string
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
                $ref: '#/components/schemas/Pages_update-static-content_Response_200'
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
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                nodes:
                  type: array
                  items:
                    $ref: >-
                      #/components/schemas/PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItems
                  description: >-
                    List of DOM Nodes with the new content that will be updated
                    in each node.
              required:
                - nodes
components:
  schemas:
    PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItems0:
      type: object
      properties:
        nodeId:
          type: string
          description: Node UUID
        text:
          type: string
          description: >-
            HTML content of the node, including the HTML tag. The HTML tags must
            be the same as what's returned from the Get Content endpoint.
      required:
        - nodeId
        - text
    PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItemsOneOf1PropertyOverridesItems:
      type: object
      properties:
        propertyId:
          type: string
          description: The ID of the property.
        text:
          type: string
          description: >
            The new string or HTML value used to override the component instance
            property value. 

            The provided value must be compatible with the type of the component
            instance property. 

            For example, attempting to override a single-line plain-text
            property with a multi-line 

            value will result in an error.
      required:
        - propertyId
        - text
    PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItems1:
      type: object
      properties:
        nodeId:
          type: string
          description: Node UUID
        propertyOverrides:
          type: array
          items:
            $ref: >-
              #/components/schemas/PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItemsOneOf1PropertyOverridesItems
          description: >-
            A list of component instance properties to override within the
            specified secondary locale.
      required:
        - nodeId
        - propertyOverrides
    PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItemsOneOf2ChoicesItems:
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
    PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItems2:
      type: object
      properties:
        nodeId:
          type: string
          description: Node UUID
        choices:
          type: array
          items:
            $ref: >-
              #/components/schemas/PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItemsOneOf2ChoicesItems
          description: The list of choices to set on the select node.
      required:
        - nodeId
        - choices
    PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItems3:
      type: object
      properties:
        nodeId:
          type: string
          description: Node UUID
        placeholder:
          type: string
          description: The placeholder text of the input node
      required:
        - nodeId
        - placeholder
    PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItems4:
      type: object
      properties:
        nodeId:
          type: string
          description: Node UUID
        value:
          type: string
          description: The text content of the submit button.
        waitingText:
          type: string
          description: The text to show while the form is submitting.
      required:
        - nodeId
    PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItems5:
      type: object
      properties:
        nodeId:
          type: string
          description: Node UUID
        value:
          type: string
          description: The text content of the search button.
      required:
        - nodeId
        - value
    PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItems:
      oneOf:
        - $ref: >-
            #/components/schemas/PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItems0
        - $ref: >-
            #/components/schemas/PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItems1
        - $ref: >-
            #/components/schemas/PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItems2
        - $ref: >-
            #/components/schemas/PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItems3
        - $ref: >-
            #/components/schemas/PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItems4
        - $ref: >-
            #/components/schemas/PagesPageIdDomPostRequestBodyContentApplicationJsonSchemaNodesItems5
    Pages_update-static-content_Response_200:
      type: object
      properties:
        errors:
          type: array
          items:
            type: string
          description: A list of error messages, if any.
      required:
        - errors

```

## SDK Code Examples

```python
from webflow import (
    ComponentInstanceNodePropertyOverridesWrite,
    ComponentInstanceNodePropertyOverridesWritePropertyOverridesItem,
    Select,
    SelectNodeWriteChoicesItem,
    SubmitButtonNodeWrite,
    TextInputNodeWrite,
    TextNodeWrite,
    Webflow,
)

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.pages.update_static_content(
    page_id="63c720f9347c2139b248e552",
    locale_id="localeId",
    nodes=[
        TextNodeWrite(
            node_id="a245c12d-995b-55ee-5ec7-aa36a6cad623",
            text="<h1>The Hitchhiker's Guide to the Galaxy</h1>",
        ),
        TextNodeWrite(
            node_id="a245c12d-995b-55ee-5ec7-aa36a6cad627",
            text="<div><h3>Don't Panic!</h3><p>Always know where your towel is.</p></div>",
        ),
        Select(
            node_id="a245c12d-995b-55ee-5ec7-aa36a6cad635",
            choices=[
                SelectNodeWriteChoicesItem(
                    value="choice-1",
                    text="First choice",
                ),
                SelectNodeWriteChoicesItem(
                    value="choice-2",
                    text="Second choice",
                ),
            ],
        ),
        TextInputNodeWrite(
            node_id="a245c12d-995b-55ee-5ec7-aa36a6cad642",
            placeholder="Enter something here...",
        ),
        SubmitButtonNodeWrite(
            node_id="a245c12d-995b-55ee-5ec7-aa36a6cad671",
            value="Submit",
            waiting_text="Submitting...",
        ),
        ComponentInstanceNodePropertyOverridesWrite(
            node_id="a245c12d-995b-55ee-5ec7-aa36a6cad629",
            property_overrides=[
                ComponentInstanceNodePropertyOverridesWritePropertyOverridesItem(
                    property_id="7dd14c08-2e96-8d3d-2b19-b5c03642a0f0",
                    text="<div><h1>Time is an <em>illusion</em></h1></div>",
                ),
                ComponentInstanceNodePropertyOverridesWritePropertyOverridesItem(
                    property_id="7dd14c08-2e96-8d3d-2b19-b5c03642a0f1",
                    text="Life, the Universe and Everything",
                ),
            ],
        ),
    ],
)

```

```typescript
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.pages.updateStaticContent("63c720f9347c2139b248e552", {
    localeId: "localeId",
    nodes: [{
            nodeId: "a245c12d-995b-55ee-5ec7-aa36a6cad623",
            text: "<h1>The Hitchhiker's Guide to the Galaxy</h1>"
        }, {
            nodeId: "a245c12d-995b-55ee-5ec7-aa36a6cad627",
            text: "<div><h3>Don't Panic!</h3><p>Always know where your towel is.</p></div>"
        }, {
            nodeId: "a245c12d-995b-55ee-5ec7-aa36a6cad635",
            choices: [{
                    value: "choice-1",
                    text: "First choice"
                }, {
                    value: "choice-2",
                    text: "Second choice"
                }]
        }, {
            nodeId: "a245c12d-995b-55ee-5ec7-aa36a6cad642",
            placeholder: "Enter something here..."
        }, {
            nodeId: "a245c12d-995b-55ee-5ec7-aa36a6cad671",
            value: "Submit",
            waitingText: "Submitting..."
        }, {
            nodeId: "a245c12d-995b-55ee-5ec7-aa36a6cad629",
            propertyOverrides: [{
                    propertyId: "7dd14c08-2e96-8d3d-2b19-b5c03642a0f0",
                    text: "<div><h1>Time is an <em>illusion</em></h1></div>"
                }, {
                    propertyId: "7dd14c08-2e96-8d3d-2b19-b5c03642a0f1",
                    text: "Life, the Universe and Everything"
                }]
        }]
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

	url := "https://api.webflow.com/v2/pages/63c720f9347c2139b248e552/dom?localeId=localeId"

	payload := strings.NewReader("{\n  \"nodes\": [\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad623\",\n      \"text\": \"<h1>The Hitchhiker's Guide to the Galaxy</h1>\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad627\",\n      \"text\": \"<div><h3>Don't Panic!</h3><p>Always know where your towel is.</p></div>\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad635\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"choices\": [\n        {\n          \"value\": \"choice-1\",\n          \"text\": \"First choice\"\n        },\n        {\n          \"value\": \"choice-2\",\n          \"text\": \"Second choice\"\n        }\n      ]\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad642\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"placeholder\": \"Enter something here...\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad671\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"value\": \"Submit\",\n      \"waitingText\": \"Submitting...\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad629\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"propertyOverrides\": [\n        {\n          \"propertyId\": \"7dd14c08-2e96-8d3d-2b19-b5c03642a0f0\",\n          \"text\": \"<div><h1>Time is an <em>illusion</em></h1></div>\"\n        },\n        {\n          \"propertyId\": \"7dd14c08-2e96-8d3d-2b19-b5c03642a0f1\",\n          \"text\": \"Life, the Universe and Everything\"\n        }\n      ]\n    }\n  ]\n}")

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

url = URI("https://api.webflow.com/v2/pages/63c720f9347c2139b248e552/dom?localeId=localeId")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Post.new(url)
request["Authorization"] = 'Bearer <token>'
request["Content-Type"] = 'application/json'
request.body = "{\n  \"nodes\": [\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad623\",\n      \"text\": \"<h1>The Hitchhiker's Guide to the Galaxy</h1>\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad627\",\n      \"text\": \"<div><h3>Don't Panic!</h3><p>Always know where your towel is.</p></div>\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad635\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"choices\": [\n        {\n          \"value\": \"choice-1\",\n          \"text\": \"First choice\"\n        },\n        {\n          \"value\": \"choice-2\",\n          \"text\": \"Second choice\"\n        }\n      ]\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad642\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"placeholder\": \"Enter something here...\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad671\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"value\": \"Submit\",\n      \"waitingText\": \"Submitting...\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad629\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"propertyOverrides\": [\n        {\n          \"propertyId\": \"7dd14c08-2e96-8d3d-2b19-b5c03642a0f0\",\n          \"text\": \"<div><h1>Time is an <em>illusion</em></h1></div>\"\n        },\n        {\n          \"propertyId\": \"7dd14c08-2e96-8d3d-2b19-b5c03642a0f1\",\n          \"text\": \"Life, the Universe and Everything\"\n        }\n      ]\n    }\n  ]\n}"

response = http.request(request)
puts response.read_body
```

```java
HttpResponse<String> response = Unirest.post("https://api.webflow.com/v2/pages/63c720f9347c2139b248e552/dom?localeId=localeId")
  .header("Authorization", "Bearer <token>")
  .header("Content-Type", "application/json")
  .body("{\n  \"nodes\": [\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad623\",\n      \"text\": \"<h1>The Hitchhiker's Guide to the Galaxy</h1>\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad627\",\n      \"text\": \"<div><h3>Don't Panic!</h3><p>Always know where your towel is.</p></div>\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad635\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"choices\": [\n        {\n          \"value\": \"choice-1\",\n          \"text\": \"First choice\"\n        },\n        {\n          \"value\": \"choice-2\",\n          \"text\": \"Second choice\"\n        }\n      ]\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad642\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"placeholder\": \"Enter something here...\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad671\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"value\": \"Submit\",\n      \"waitingText\": \"Submitting...\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad629\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"propertyOverrides\": [\n        {\n          \"propertyId\": \"7dd14c08-2e96-8d3d-2b19-b5c03642a0f0\",\n          \"text\": \"<div><h1>Time is an <em>illusion</em></h1></div>\"\n        },\n        {\n          \"propertyId\": \"7dd14c08-2e96-8d3d-2b19-b5c03642a0f1\",\n          \"text\": \"Life, the Universe and Everything\"\n        }\n      ]\n    }\n  ]\n}")
  .asString();
```

```php
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('POST', 'https://api.webflow.com/v2/pages/63c720f9347c2139b248e552/dom?localeId=localeId', [
  'body' => '{
  "nodes": [
    {
      "nodeId": "a245c12d-995b-55ee-5ec7-aa36a6cad623",
      "text": "<h1>The Hitchhiker\'s Guide to the Galaxy</h1>"
    },
    {
      "nodeId": "a245c12d-995b-55ee-5ec7-aa36a6cad627",
      "text": "<div><h3>Don\'t Panic!</h3><p>Always know where your towel is.</p></div>"
    },
    {
      "nodeId": "a245c12d-995b-55ee-5ec7-aa36a6cad635",
      "text": "<h1>Hello world</h1>",
      "choices": [
        {
          "value": "choice-1",
          "text": "First choice"
        },
        {
          "value": "choice-2",
          "text": "Second choice"
        }
      ]
    },
    {
      "nodeId": "a245c12d-995b-55ee-5ec7-aa36a6cad642",
      "text": "<h1>Hello world</h1>",
      "placeholder": "Enter something here..."
    },
    {
      "nodeId": "a245c12d-995b-55ee-5ec7-aa36a6cad671",
      "text": "<h1>Hello world</h1>",
      "value": "Submit",
      "waitingText": "Submitting..."
    },
    {
      "nodeId": "a245c12d-995b-55ee-5ec7-aa36a6cad629",
      "text": "<h1>Hello world</h1>",
      "propertyOverrides": [
        {
          "propertyId": "7dd14c08-2e96-8d3d-2b19-b5c03642a0f0",
          "text": "<div><h1>Time is an <em>illusion</em></h1></div>"
        },
        {
          "propertyId": "7dd14c08-2e96-8d3d-2b19-b5c03642a0f1",
          "text": "Life, the Universe and Everything"
        }
      ]
    }
  ]
}',
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Content-Type' => 'application/json',
  ],
]);

echo $response->getBody();
```

```csharp
var client = new RestClient("https://api.webflow.com/v2/pages/63c720f9347c2139b248e552/dom?localeId=localeId");
var request = new RestRequest(Method.POST);
request.AddHeader("Authorization", "Bearer <token>");
request.AddHeader("Content-Type", "application/json");
request.AddParameter("application/json", "{\n  \"nodes\": [\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad623\",\n      \"text\": \"<h1>The Hitchhiker's Guide to the Galaxy</h1>\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad627\",\n      \"text\": \"<div><h3>Don't Panic!</h3><p>Always know where your towel is.</p></div>\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad635\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"choices\": [\n        {\n          \"value\": \"choice-1\",\n          \"text\": \"First choice\"\n        },\n        {\n          \"value\": \"choice-2\",\n          \"text\": \"Second choice\"\n        }\n      ]\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad642\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"placeholder\": \"Enter something here...\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad671\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"value\": \"Submit\",\n      \"waitingText\": \"Submitting...\"\n    },\n    {\n      \"nodeId\": \"a245c12d-995b-55ee-5ec7-aa36a6cad629\",\n      \"text\": \"<h1>Hello world</h1>\",\n      \"propertyOverrides\": [\n        {\n          \"propertyId\": \"7dd14c08-2e96-8d3d-2b19-b5c03642a0f0\",\n          \"text\": \"<div><h1>Time is an <em>illusion</em></h1></div>\"\n        },\n        {\n          \"propertyId\": \"7dd14c08-2e96-8d3d-2b19-b5c03642a0f1\",\n          \"text\": \"Life, the Universe and Everything\"\n        }\n      ]\n    }\n  ]\n}", ParameterType.RequestBody);
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = [
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
]
let parameters = ["nodes": [
    [
      "nodeId": "a245c12d-995b-55ee-5ec7-aa36a6cad623",
      "text": "<h1>The Hitchhiker's Guide to the Galaxy</h1>"
    ],
    [
      "nodeId": "a245c12d-995b-55ee-5ec7-aa36a6cad627",
      "text": "<div><h3>Don't Panic!</h3><p>Always know where your towel is.</p></div>"
    ],
    [
      "nodeId": "a245c12d-995b-55ee-5ec7-aa36a6cad635",
      "text": "<h1>Hello world</h1>",
      "choices": [
        [
          "value": "choice-1",
          "text": "First choice"
        ],
        [
          "value": "choice-2",
          "text": "Second choice"
        ]
      ]
    ],
    [
      "nodeId": "a245c12d-995b-55ee-5ec7-aa36a6cad642",
      "text": "<h1>Hello world</h1>",
      "placeholder": "Enter something here..."
    ],
    [
      "nodeId": "a245c12d-995b-55ee-5ec7-aa36a6cad671",
      "text": "<h1>Hello world</h1>",
      "value": "Submit",
      "waitingText": "Submitting..."
    ],
    [
      "nodeId": "a245c12d-995b-55ee-5ec7-aa36a6cad629",
      "text": "<h1>Hello world</h1>",
      "propertyOverrides": [
        [
          "propertyId": "7dd14c08-2e96-8d3d-2b19-b5c03642a0f0",
          "text": "<div><h1>Time is an <em>illusion</em></h1></div>"
        ],
        [
          "propertyId": "7dd14c08-2e96-8d3d-2b19-b5c03642a0f1",
          "text": "Life, the Universe and Everything"
        ]
      ]
    ]
  ]] as [String : Any]

let postData = JSONSerialization.data(withJSONObject: parameters, options: [])

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/pages/63c720f9347c2139b248e552/dom?localeId=localeId")! as URL,
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