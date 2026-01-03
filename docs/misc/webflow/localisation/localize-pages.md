# Localizing pages

> How to use Page localization APIs to localize page content in secondary locales

Webflow's Data API enables you to localize DOM content and metadata across different locales. Localizing pages requires two main steps:

1. Retrieve data from the **primary locale**
2. Update data in the **secondary locale**

## Workflows

There are two main workflows for localizing pages:

<CardGroup cols={2}>
  <Card
    title="DOM Content"
    href="#dom-content"
    iconPosition="left"
    iconSize="12"
    icon={
      <>
        <img src="https://dhygzobemt712.cloudfront.net/Icons/Dark/64px/Grid.svg" alt="" className="hidden dark:block" />
        <img src="https://dhygzobemt712.cloudfront.net/Icons/Light/64px/Grid.svg" alt="" className="block dark:hidden" />
      </>
    }
  >
    Localize text content in a secondary locale
  </Card>

  <Card
    title="Metadata"
    href="#metadata"
    iconPosition="left"
    iconSize="12"
    icon={
      <>
        <img src="https://dhygzobemt712.cloudfront.net/Icons/Dark/64px/Controls.svg" alt="" className="hidden dark:block" />
        <img src="https://dhygzobemt712.cloudfront.net/Icons/Light/64px/Controls.svg" alt="" className="block dark:hidden" />
      </>
    }
  >
    Localize page titles, SEO descriptions, and Open Graph descriptions in a secondary locale
  </Card>
</CardGroup>

{/* <Note>
The Page APIs only support localizing content in **secondary locales**. Content in the primary locale serves as the source of truth and must be updated through the Webflow canvas.
</Note> */}

## DOM Content

The DOM content endpoints enable you to localize text for any secondary locale. The process involves the following steps:

<Steps>
  <Step title="Fetch primary locale content">
    Use the [Get page content endpoint](/data/reference/pages-and-components/pages/get-content) to retrieve the page's DOM structure and default content.
  </Step>

  <Step title="Translate content">
    Traverse the `nodes` array in the response to identify and translate all text content.
  </Step>

  <Step title="Update secondary locale content">
    Use the `localeId` parameter in your request to the [Update Page Content endpoint](/data/reference/pages-and-components/pages/update-static-content) to apply the localized content.
  </Step>
</Steps>

{/* <Note title="Handling component instances">
Component localization follows a specific pattern. A component instance will only appear in the Get Page Content response if its property values have been overridden from their defaults in the primary locale.

When an overridden component instance is present, you can provide localized values for its properties in your call to the Update Page Content endpoint for a secondary locale.
</Note> */}

***

### Retrieve page content

Start by getting the content structure for a given static page. You'll need the `pageId`, which you can find by listing all pages for a site using the [list pages endpoint](/data/reference/pages-and-components/pages/list). Once you have the `pageId`, you can use the [get page content endpoint](/data/reference/pages-and-components/pages/get-content) to retrieve the content structure for the page.

##### Request

<CodeBlocks>
  ```curl cURL
  curl -G https://api.webflow.com/v2/pages/<PAGE_ID>/dom \
      -H "Authorization: Bearer <token>" \
      -d limit=100 \
      -d offset=0
  ```

  ```ts title={"getPageContent.ts"}
  import { WebflowClient } from "webflow-api";

  // Define Webflow Client
  const webflow = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });

  const SITE_ID = "YOUR_SITE_ID";
  const PAGE_TITLE = "YOUR_PAGE_TITLE";

  // List Pages
  const { pages } = await webflow.pages.list(SITE_ID);

  // Find Page by Title
  const selectedPage = pages?.find((page) => page.title === PAGE_TITLE);

  if (selectedPage) {
    // Get Page Content
    const pageContent = await webflow.pages.getContent(selectedPage.id);
    console.log(pageContent);
  } else {
    console.log(`Page with title "${PAGE_TITLE}" not found.`);
  }
  ```
</CodeBlocks>

**Note:**  This API will only return content for static pages. Dynamic pages, like CMS Collection templates will return an empty response.

##### Response

The response contains a `nodes` array with the page's static content. Each node includes a `type` property that defines its content type.

<br />

<div class="my-6">
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 items-center">
    <Card>
      <ParamField path="pageId" type="string" required={true}>
        The unique identifier for the page
      </ParamField>

      <ParamField path="nodes" type="list of objects" required={true}>
        The list of nodes that represent the static content of the page
      </ParamField>

      <ParamField path="pagination" type="object" required={true}>
        The pagination information for the response
      </ParamField>

      <ParamField path="lastUpdated" type="string" required={true}>
        The date the page was most recently updated
      </ParamField>
    </Card>

    <div>
      <EndpointResponseSnippet endpoint="GET /pages/:page_id/dom" />
    </div>
  </div>
</div>

<Note>
  By default, if you don't include a `localeId` in your request, the response will return content from the primary locale.
</Note>

#### Nodes

The [page content endpoint](/data/reference/pages-and-components/pages/get-content) returns a list of nodes that represent static text and images available for localization. **Note:** this endpoint doesn't return the entire DOM structure of the page, but only the static content available for localization.

#### Node types

Different node types represent different kinds of content, each with its own structure and properties.

| Node type            | Description                                                                                                                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`               | Represents text content. Including headings, [text blocks](https://help.webflow.com/hc/en-us/articles/33961346059027-Use-text-blocks-in-Webflow), [rich text](https://help.webflow.com/hc/en-us/articles/33961256808467-Rich-text-element-overview), form labels, and other text content on a page. |
| `image`              | Represents static images on a page. It contains alt text details for accessibility and the `assetId` for fetching the actual image resource.                                                                                                                                                        |
| `text-input`         | Represents a `textinput` and `textarea` fields on a form.                                                                                                                                                                                                                                           |
| `select`             | Represents a select field and its options on a form.                                                                                                                                                                                                                                                |
| `submit-button`      | Represents a submit button on a form. It contains the button text and waiting text of the button.                                                                                                                                                                                                   |
| `search-button`      | Represents the button text of a search button on a [site search element](https://help.webflow.com/hc/en-us/articles/33961242348179-Site-search).                                                                                                                                                    |
| `component-instance` | Represents a component instance on a page. Learn more about [localizing components](/data/docs/working-with-localization/localize-components) in the guide.                                                                                                                                         |

<br />

#### Node properties

<div>
  Each node type has a specific structure and properties that define the content it contains. However, all nodes will have the following properties:

  {/* <!-- vale off --> */}

  <Card>
    <ParamField path="id" type="string" required={true}>
      Node UUID
    </ParamField>

    <ParamField path="type" type="enum" required={true}>
      The type of the node.

      <br />

      Acceptable values: `text`, `image`, `text-input`, `select`, `submit-button`, `search-button`, `component-instance`
    </ParamField>

    <ParamField path="attributes" type="object" required={false}>
      The [custom attributes](https://help.webflow.com/hc/en-us/articles/33961389460115-Custom-attributes#how-to-use-cms-data-in-custom-attributes) of the node. These are typically used to store custom data on the node like `aria-labels` for accessibility or `data-w-id`.
    </ParamField>
  </Card>

  {/* <!-- vale on --> */}
</div>

<br />

##### Node properties by type

Each node type has a unique structure for accessing page content. For example, a `text` node contains a `text` object, which typically includes `html` and `text` properties. These properties provide context for strings that can be localized. The tabs below detail the specific properties for each node type.

<br />

{/* <!-- vale off --> */}

<Tabs>
  <Tab title="Text">
    <div>
      <Card>
        <ParamField path="id" type="string" required={true}>
          Node UUID
        </ParamField>

        <ParamField path="type" type="enum" required={true}>
          The type of the node. `text`
        </ParamField>

        <ParamField path="text" type="object" required={true}>
          The text content of the node

          <Accordion title="+ Show 2 properties">
            <ParamField path="html" type="string" required={true}>
              The HTML content of the node
            </ParamField>

            <ParamField path="text" type="string" required={true}>
              The text content of the node
            </ParamField>
          </Accordion>
        </ParamField>

        <ParamField path="attributes" type="map from strings to strings" required={false}>
          The custom attributes of the node
        </ParamField>
      </Card>

      <CodeBlocks>
        ```json title="Text node example"
        {
          "id": "a245c12d-995b-55ee-5ec7-aa36a6cad623",
          "type": "text",
          "text": {
            "html": "<h1>Don't Panic!</h1>",
            "text": "Don't Panic!"
          },
          "attributes": {}
        },
        {
          "id": "a245c12d-995b-55ee-5ec7-aa36a6cad627",
          "type": "text",
          "text": {
            "html": "<span data-w-id=\"b3107...\">$9.99</span>",
            "text": "$9.99"
          },
          "attributes": {}
        }
        ```
      </CodeBlocks>
    </div>

    <Note title="Nested HTML tags">
      The `text.html` property may contain nested HTML tags with `data-w-id` attributes (e.g., `data-w-id="some-unique-identifier"`). Retain these identifiers when updating page content in secondary locales to preserve custom attributes and links on inner HTML elements.
    </Note>
  </Tab>

  <Tab title="Image">
    <div>
      <Card>
        <ParamField path="id" type="string" required={true}>
          Node UUID
        </ParamField>

        <ParamField path="type" type="enum" required={true}>
          The type of the node. `image`
        </ParamField>

        <ParamField path="image" type="object" required={true}>
          The image content of the node

          <Accordion title="+ Show 2 properties">
            <ParamField path="alt" type="string" required={true}>
              The alt text for the image
            </ParamField>

            <ParamField path="assetId" type="string" required={true}>
              The ID of the asset for the image
            </ParamField>
          </Accordion>
        </ParamField>

        <ParamField path="attributes" type="map from strings to strings" required={false}>
          The custom attributes of the node
        </ParamField>
      </Card>

      ```json title="Image node example"
      {
        "id": "a245c12d-995b-55ee-5ec7-aa36a6cad629",
        "type": "image",
        "image": {
          "alt": "Marvin, the Paranoid Android",
          "assetId": "659595234426a9fcbad57043"
        },
        "attributes": {}
      }
      ```
    </div>

    <Warning title="Updating images isn't supported by the API">
      Currently, updating images isn't supported by the API. To update images, you'll need to update the image asset in the Webflow designer.
    </Warning>
  </Tab>

  <Tab title="Text Input">
    <div>
      <Card>
        <ParamField path="id" type="string" required={true}>
          Node UUID
        </ParamField>

        <ParamField path="type" type="enum" required={true}>
          The type of the node. `text-input`
        </ParamField>

        <ParamField path="placeholder" type="string" required={false}>
          The placeholder text for the input field
        </ParamField>

        <ParamField path="attributes" type="map from strings to strings" required={false}>
          The custom attributes of the node
        </ParamField>
      </Card>

      ```json title="Text input node example"
      {
        "id": "a245c12d-995b-55ee-5ec7-aa36a6cad642",
        "type": "text-input",
        "placeholder": "Enter something here...",
        "attributes": {}
      }
      ```
    </div>
  </Tab>

  <Tab title="Select">
    <div>
      <Card>
        <ParamField path="id" type="string" required={true}>
          Node UUID
        </ParamField>

        <ParamField path="type" type="enum" required={true}>
          The type of the node. `select`
        </ParamField>

        <ParamField path="choices" type="list of objects" required={true}>
          The choices for the select field

          <Accordion title="+ Show 2 properties">
            <ParamField path="value" type="string" required={true}>
              The value of the choice
            </ParamField>

            <ParamField path="text" type="string" required={true}>
              The text of the choice
            </ParamField>
          </Accordion>
        </ParamField>

        <ParamField path="attributes" type="map from strings to strings" required={false}>
          The custom attributes of the node
        </ParamField>
      </Card>

      ```json title="Select node example"
      {
        "id": "a245c12d-995b-55ee-5ec7-aa36a6cad635",
        "type": "select",
        "choices": [
          {
            "value": "choice-1",
            "text": "First choice"
          },
          {
            "value": "choice-2",
            "text": "Second choice"
          }
        ],
        "attributes": {}
      }
      ```
    </div>
  </Tab>

  <Tab title="Submit Button">
    <div>
      <Card>
        <ParamField path="id" type="string" required={true}>
          Node UUID
        </ParamField>

        <ParamField path="type" type="enum" required={true}>
          The type of the node. `submit-button`
        </ParamField>

        <ParamField path="value" type="string" required={true}>
          The text content of the button
        </ParamField>

        <ParamField path="waitingText" type="string" required={false}>
          The text content of the button while submitting
        </ParamField>

        <ParamField path="attributes" type="map from strings to strings" required={false}>
          The custom attributes of the node
        </ParamField>
      </Card>

      ```json title="Submit button node example"
      {
        "id": "a245c12d-995b-55ee-5ec7-aa36a6cad671",
        "type": "submit-button",
        "value": "Submit",
        "waitingText": "Submitting...",
        "attributes": {}
      }
      ```
    </div>
  </Tab>

  <Tab title="Component Instance">
    To learn more about localizing components, see the [localizing components](/data/docs/working-with-localization/localize-components) guide.

    <div>
      <Card>
        <ParamField path="id" type="string" required={true}>
          Node UUID
        </ParamField>

        <ParamField path="type" type="enum" required={true}>
          The type of the node. `component-instance`
        </ParamField>

        <ParamField path="componentId" type="string" required={true}>
          The ID of the component
        </ParamField>

        <ParamField path="propertyOverrides" type="array" required={false}>
          The property overrides for the component instance

          <Accordion title="+ Show 4 properties">
            <ParamField path="propertyId" type="string" required={true}>
              The ID of the property
            </ParamField>

            <ParamField path="type" type="string" required={true}>
              The type of the property
            </ParamField>

            <ParamField path="label" type="string" required={true}>
              The label of the property
            </ParamField>

            <ParamField path="text" type="object" required={true}>
              The text content of the property

              <Accordion title="+ Show 2 properties">
                <ParamField path="html" type="string" required={false}>
                  The HTML content of the property
                </ParamField>

                <ParamField path="text" type="string" required={false}>
                  The text content of the property
                </ParamField>
              </Accordion>
            </ParamField>
          </Accordion>
        </ParamField>
      </Card>

      <CodeBlocks>
        ```json title="Component instance node example"
        {
          "id": "a245c12d-995b-55ee-5ec7-aa36a6cad631",
          "type": "component-instance",
          "componentId": "6258612d1ee792848f805dcf",
             "propertyOverrides": [
               {
                 "propertyId": "a245c12d-995b-55ee-5ec7-aa36a6cad633",
              "type": "Plain Text",
              "label": "Catchphrase",
              "text": {
                "html": null,
                "text": "Don't Panic!"
              }
               },
               {
                 "propertyId": "a245c12d-995b-55ee-5ec7-aa36a6cad635",
              "type": "Rich Text",
              "label": "Tagline",
              "text": {
                "html": "<div><p>Always know where your towel is.</p></div>",
                "text": null
              }
            }
          ]
        }
        ```
      </CodeBlocks>
    </div>
  </Tab>
</Tabs>

{/* <!-- vale on --> */}

### Update page content

Once you've identified and translated the content you want to localize, you can update it using the [update page content endpoint](/data/reference/pages-and-components/pages/update-static-content). You'll need to pass in the `localeId` of the secondary locale you want to update as a query parameter, and a list of `nodes` to update in the request body.

Each node should have the `nodeId` of the node you want to update, and the node value you want to update. The node value will vary depending on the node type.

<EndpointRequestSnippet endpoint="POST /pages/:page_id/dom" />

<Note title="Updating text nodes">
  When updating text nodes, pass the `text` property with the translated text, structured as the HTML content received from the Get Page Content endpoint. The HTML tag structure must remain identical to the Get Content endpoint's response.
</Note>

<Warning title="Updating images isn't supported by the API">
  Currently, updating images isn't supported by the API. To update images, you'll need to update the image asset in the Webflow designer.
</Warning>

## Metadata

The metadata endpoints enable you to localize SEO and Open Graph content for any secondary locale. The process involves the following steps:

<Steps>
  <Step title="Retrieve primary locale metadata">
    Use the [Get page metadata endpoint](/data/reference/pages-and-components/pages/get-metadata) to retrieve the page's metadata.
  </Step>

  <Step title="Translate metadata">
    Translate the metadata for the secondary locale.
  </Step>

  <Step title="Update secondary locale metadata">
    Use the [Update page metadata endpoint](/data/reference/pages-and-components/pages/update-page-settings) to update the metadata for the secondary locale.
  </Step>
</Steps>

### Retrieve page metadata

First, retrieve the page metadata for the primary locale using the [Get page metadata endpoint](/data/reference/pages-and-components/pages/get-metadata).

This endpoint will return metadata shown above for the primary locale. The response includes both internal and external information about your webflow page, including unique identifiers, draft information, and publish times.

For a full list of information returned see the [Get page metadata page in the API reference](/data/reference/pages-and-components/pages/get-metadata).

<div>
  <div>
    ##### Request

    <EndpointRequestSnippet endpoint="GET /v2/pages/:page_id" />
  </div>

  <div>
    ##### Response

    <EndpointResponseSnippet endpoint="GET /pages/:page_id" />
  </div>
</div>

### Update page metadata

To update metadata for a secondary locale, translate the properties listed below and include them in the request body when calling the [Update page metadata endpoint](/data/reference/pages-and-components/pages/update-page-settings).

<div>
  <div>
    <Card>
      <EndpointSchemaSnippet endpoint="PUT /pages/:page_id" selector="request.body" />
    </Card>
  </div>

  <CodeBlocks>
    ```curl cURL
    curl -X PUT https://api.webflow.com/v2/pages/<PAGE_ID>?localeId=<SECONDARY_LOCALE_ID> \
         -H "Authorization: Bearer <token>" \
         -H "Content-Type: application/json" \
         -d '{
           "title": "Página de inicio - Mi sitio web",
           "seo": {
             "title": "Mi sitio web - Página de inicio",
             "description": "Descripción SEO en español para mejor visibilidad en buscadores"
           },
           "openGraph": {
             "title": "Mi sitio web",
             "description": "Descripción para compartir en redes sociales"
           }
         }'
    ```

    ```javascript Node.js
    const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
    await client.pages.updatePageSettings("YOUR_PAGE_ID", {
      localeId: "SECONDARY_LOCALE_ID",
      title: "Página de inicio - Mi sitio web",
      seo: {
        title: "Mi sitio web - Página de inicio",
        description: "Descripción SEO en español para mejor visibilidad en buscadores"
      },
      openGraph: {
        title: "Mi sitio web", 
        description: "Descripción para compartir en redes sociales"
      }
    });
    ```
  </CodeBlocks>
</div>

<Warning>
  **Slug localization** is only available with specific Webflow plans:

  * **Localize Advanced add-on**
  * **Enterprise Localization**
</Warning>

## Complete localization workflow

Here's a complete example that demonstrates the full page localization process for static content (not including components):

<CodeBlocks>
  ```javascript Node.js
  const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });

  // Localize page static content and metadata
  // Assume `translations` object holds page-level translations in memory for the secondary locale
  async function localizePage(pageId, secondaryLocaleId, translations) {
    // 1. Get primary locale content structure
    const contentData = await client.pages.getContent(pageId);
    
    // 2. Prepare static content updates
    const staticUpdates = {
      nodes: contentData.nodes
        .filter(node => node.type === 'text' && translations.static[node.id])
        .map(node => ({
          nodeId: node.id,
          text: translations.static[node.id]
        }))
    };
    
    // 3. Update page content
    if (staticUpdates.nodes.length > 0) {
      await client.pages.updateStaticContent(pageId, {
        localeId: secondaryLocaleId,
        nodes: staticUpdates.nodes,
      });
    }
    
    // 4. Update page metadata
    if (translations.metadata) {
      await client.pages.updatePageSettings(pageId, {
        localeId: secondaryLocaleId,
        title: translations.metadata.title,
        seo: {
          title: translations.metadata.seo.title,
          description: translations.metadata.seo.description,
        },
        openGraph: {
          title: translations.metadata.openGraph.title,
          description: translations.metadata.openGraph.description,
        },
      });
    }
  }
  ```
</CodeBlocks>

## FAQ

<AccordionGroup>
  <Accordion title="Do I need to update all nodes when updating page content?">
    No, you only need to include the nodes you want to update in the request body. If you don't include a node in the Update Page Content request body, that element will inherit the content from the primary locale.
  </Accordion>

  <Accordion title="What happens if an error occurs when updating page content?">
    If an error occurs when attempting to update a node on a page, the request may still return a 200 status code, but you may want to check the response body for the `errors` array to see if any errors surfaced.
  </Accordion>

  <Accordion title="Why can't I update page content in the primary locale with APIs?">
    Because the primary locale is the source of truth for content, changes must be initiated through the Webflow canvas at this time.
  </Accordion>

  <Accordion title="Why am I getting component-instance types in the Get Page Content response?">
    Component instances are included in the [Get Page Content API](https://developers.webflow.com/data/reference/pages-and-components/pages/get-content) response to provide a more wholistic view of the content on a page.

    When getting page content for the primary locale, all component instances are included in the response. When getting page content for a secondary locale, only component instances with property overrides are included in the response.

    Learn more in the [Components and properties](/data/docs/working-with-localization/localize-pages) guide.
  </Accordion>

  <Accordion title="After making updates to page content, why isnt' the content reflecting in the Webflow canvas?">
    When making updates to your site via Data APIs, you may need to refresh the page in order to see the changes reflect in the Webflow canvas.
  </Accordion>
</AccordionGroup>
