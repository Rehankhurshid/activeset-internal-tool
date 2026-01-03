# Working with Localization APIs

> Learn how to manage multilingual content using the Webflow Data API

Webflow offers APIs that enable you to manage site content across different locales. Use the APIs to localize content for pages, components, and CMS items on your site.

For detailed information on enabling localization, see the [help center documentation](https://help.webflow.com/hc/en-us/articles/33961240752147-Localization-overview)

## Localizable content

Webflow supports the localization of text-based content across pages, components, and CMS items.

| Content Type                    | Scope         | Description                                                    |
| :------------------------------ | :------------ | :------------------------------------------------------------- |
| **Page Content**                | Page-specific | Static text placed directly on a page.                         |
| **Component Overrides**         | Page-specific | Custom property values applied to a single component instance. |
| **Component Property Defaults** | Site-wide     | Default values for component properties.                       |
| **Component Static Content**    | Site-wide     | Fixed content that's part of a component's structure.          |
| **CMS Items**                   | Site-wide     | Content stored in the fields of a CMS Collection item.         |

<Warning title="Data APIs do no support localizing images">
  Currently, the Data API doesn't support localizing images. To localize images, you'll need to update the image asset in the Webflow designer.
</Warning>

## Locales

When localizing a site, you'll define different **locales** to support specific languages or language-region combinations. These locales will be used to present content to users in different geographical areas or cultural backgrounds.

Locales can be defined as either primary or secondary.

<CardGroup cols={2}>
  <Card title="Primary locale">
    The default language for your site. **There can only be one primary locale per site.**
  </Card>

  <Card title="Secondary locale">
    Additional languages or regions for your site. The number of secondary locales you can have is limited by your Webflow plan.
  </Card>
</CardGroup>

{/* <Tip title="Try localization for free">
  Try out the Webflow localization APIs **for free** by adding a secondary
  locale to your Webflow site. 

  You can add a secondary locale from the
  Webflow Designer by navigating to **Settings > Localization**, and clicking
  the "Add new locale" button. Once you save your changes, you can start using
  the endpoints below to try localizing content in your new secondary locale.
</Tip> */}

## Locale identifiers

Once your locales are defined, you can retrieve the identifiers for each locale, which are needed for all requests to the Localization APIs. To get the identifiers, make a call to the [Get Site endpoint](/data/reference/sites/get).

<div>
  <div>
    #### Primary and secondary locales

    The `primary` property contains a single locale object, while the `secondary` property contains an array of locale objects.

    #### Locale properties

    The locale object contains the following properties relevant to the localization APIs:

    * **`id`**: The unique identifier of the locale.
    * **`cmsLocaleId`**: The unique identifier of the locale for CMS operations.

    To see all the properties of a locale, see the [Locale object](/data/reference/sites/get#locale) in the API reference.
  </div>

  <div>
    <EndpointRequestSnippet endpoint="GET /v2/sites/:site_id" />

    ```js title="Get Site API response example"
    {
      ...
      "locales": {
        "primary": {
          "id": "653fd9af6a07fc9cfd7a5e57",
          "cmsLocaleId": "653ad57de882f528b32e810e",
          "tag": "en-US",
          ...
        },
        "secondary": [
          {
            "id": "653fd9af6a07fc9cfd7a5e56",
            "cmsLocaleId": "653fd9af6a07fc9cfd7a5e5d",
            "tag": "fr-FR",
            ...
          },
          {
            "id": "654112a3a525b2739d97664c",
            "cmsLocaleId": "654112a3a525b2739d97664f",
            "tag": "es-MX",
            ...
          },
          ...
        ]
      }
    }
    ```
  </div>
</div>

### Locale parameters and properties

When making requests to endpoints that support localization, provide the locale identifier as a query parameter or in the request body, depending on the endpoint. **If no locale identifier is provided, the request will return information from the primary locale.** These identifiers are both used as parameters in your requests and returned as properties in the response body to indicate when you're working with locale-specific data:

* **`localeId`**: The unique identifier of the locale for pages and components.
* **`cmsLocaleId`**: The unique identifier of the locale for CMS operations.

<Accordion title="Locale-specific endpoints">
  Some endpoints only support updating content in secondary locales. For these, you must provide the `localeId` parameter; otherwise, **requests to update primary locale content will fail.** These endpoints include:

  * [Update page content](/data/reference/pages-and-components/pages/update-static-content)
  * [Update component content](/data/reference/pages-and-components/components/update-content)
</Accordion>

## Workflows

Localizing content in Webflow can be done across three main areas:

<CardGroup cols={3}>
  <Card
    title="Pages"
    href="/data/docs/working-with-localization/localize-pages"
    iconPosition="left"
    iconSize="10"
    icon={
      <>
        <img src="https://dhygzobemt712.cloudfront.net/Icons/Dark/64px/FileEdit.svg" alt="" className="hidden dark:block" />
        <img src="https://dhygzobemt712.cloudfront.net/Icons/Light/64px/FileEdit.svg" alt="" className="block dark:hidden" />
      </>
    }
  >
    Static page content, metadata, and SEO settings
  </Card>

  <Card
    title="Components"
    href="/data/docs/working-with-localization/localize-components"
    iconPosition="left"
    iconSize="10"
    icon={
      <>
        <img src="https://dhygzobemt712.cloudfront.net/Icons/Dark/64px/Components.svg" alt="" className="hidden dark:block" />
        <img src="https://dhygzobemt712.cloudfront.net/Icons/Light/64px/Components.svg" alt="" className="block dark:hidden" />
      </>
    }
  >
    Reusable elements that can be customized with dynamic properties
  </Card>

  <Card
    title="CMS"
    href="#cms-localization"
    iconPosition="left"
    iconSize="10"
    icon={
      <>
        <img src="https://dhygzobemt712.cloudfront.net/Icons/Dark/64px/CMS.svg" alt="" className="hidden dark:block" />
        <img src="https://dhygzobemt712.cloudfront.net/Icons/Light/64px/CMS.svg" alt="" className="block dark:hidden" />
      </>
    }
  >
    Organized, dynamic content within collections
  </Card>
</CardGroup>

{/* <Warning>
    **Important:** For Pages and Components, the Data API endpoints only support updating content in secondary locales. Getting data from the primary locale serves as the source of truth for the content within these areas and updating primary locale content must be done through the Webflow Designer at this time.
    
    For CMS items however, you can create and manage item content in both the primary and secondary locales.
</Warning> */}

<Accordion title="Pages">
  The page localization APIs enable you to localize the following content:

  * **Static content** - Text nodes, images, form elements, and component property overrides
  * **Metadata** - Page titles, SEO descriptions, and Open Graph descriptions
  * **URLs** - Locale-specific slugs and URL structures

  {/* <Warning title="Updating primary locale content">
  While Webflow APIs allow you to *read* page content from both primary and secondary locales, all *updates* to page content (aka the DOM) via API are limited to **secondary locales**. Primary locale content must be managed directly through the Webflow Designer.
  </Warning> */}

  <Button href="/data/docs/working-with-localization/localize-pages">
    Learn how to localize pages
  </Button>

  <br />

  <br />
</Accordion>

<Accordion title="Components">
  Components are reusable design elements that contain static content, set in the component definition, and dynamic content, which can be customized with component properties.

  When localizing components in a **secondary locale**, you can use two approaches:

  * **Localize the component definition**: Modify a component's definition to update its static content, default property values, and any nested components. These changes apply to all instances of the component for the specified locale.
  * **Localize a component instance**: Override properties on a specific component instance on a page. This provides unique content for that instance without affecting the component's definition or other instances.

  ### Example scenario

  Consider a `Call-to-Action` component with a button that has the text property "Learn More."

  {/* <!-- vale off --> */}

  * **Definition localization**: To change the button text for all French-speaking users, you would update the component definition in the French locale. The button text in all `Call-to-Action` component instances on your French site would automatically change to "En savoir plus"

  * **Instance localization**: On a specific landing page in the French locale, you might want a `Call-to-Action` button to have a unique message. You would override the text property on that component instance to "Découvrez nos offres spéciales." This change would only apply to that single instance.

  {/* <!-- vale on --> */}

  To understand the difference between definition localization and instance localization, see the ["Working with Components"](/data/docs/working-with-localization/localize-components) guide.

  <Button href="/data/docs/working-with-localization/localize-components">
    Learn how to localize components
  </Button>

  <br />

  <br />
</Accordion>

<Accordion title="Webflow CMS">
  The Webflow CMS enables you to manage and deliver dynamic content, and supports comprehensive content localization to scale content delivery for diverse audiences.

  Key localization features include:

  * **Localized Variants:** Items from your primary locale can have corresponding localized variants, all sharing a single, consistent ID.
  * **Independent Publishing:** Publish localized content variants individually as needed.
  * **Locale-Specific Items:** Create CMS items that exist solely within a specific locale, without a primary locale counterpart.

  <br />

  <Button href="/data/docs/working-with-localization/localize-cms-content">
    Learn how to localize CMS items
  </Button>

  <br />

  <br />
</Accordion>

## Glossary

* **Locale**: A specific language or language-region combination used to present content (e.g., `en-US` for English, `fr-FR` for French).
* **Primary Locale**: The default language version of your site. There can only be one primary locale. API requests default to this locale if no other is specified.
* **Secondary Locale**: Any additional language or regional version of your site content.
* **`localeId`**: The unique identifier for a locale, used when working with Pages and Components APIs.
* **`cmsLocaleId`**: The unique identifier for a locale, used specifically for CMS-related API operations.

## Frequently asked questions

<Accordion title="What's the difference between localeId and cmsLocaleId?">
  `localeId` is used for localizing page and component content. `cmsLocaleId` is used exclusively for localizing CMS items. Both are retrieved from the [Get Site endpoint](/data/reference/sites/get).
</Accordion>

<Accordion title="Can I update primary locale content via the API?">
  Currently, API-based updates to page and component content are limited to secondary locales. Primary locale content for pages and components must be updated through the Webflow Designer. However, you can create and manage CMS item content in both primary and secondary locales via the API.
</Accordion>

<Accordion title="Can I localize styles and classes via the API?">
  No, styles and classes can't be localized via the Data API. They're managed through the Webflow Designer and aren't supported by the Data API.
</Accordion>

<Accordion title="What happens if I don't provide a locale identifier in my API request?">
  If no locale identifier is specified, the API will default to the site's primary locale for the request.
</Accordion>
