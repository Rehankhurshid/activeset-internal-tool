---
source: https://finsweet.com/client-first/docs/semantic-html-tags
fetched: 2026-04-01
title: "Semantic HTML tags"
---

# Semantic HTML tags

## What are semantic HTML tags?

A semantic HTML tag clearly describes what an element is.

Elements such as , , and  are all considered semantic. They describe the purpose of the element and the type of content that is inside the element.

Semantic tags are here to help users and machines better interpret our content.

#### Why do we want to use semantic HTML tags?

- Make our site more accessible (Better user experience).
- Improve how search engines crawl our website (Better SEO and discoverability).

#### What is accessibility?

If we take the definition of Wikipedia:

“Accessibility refers to the design of products, devices, services, or environments for people who experience disabilities.”

Applying this to our web development field, we understand it as:

“Web a11y means that **anyone**at **any moment** can use your website.”

If a user is sighted, it's easy to know what a sidebar is. It's easy to know what a nav is. It's easy to know what the main content is. A sighted user may not care about the difference between a regular 
 and a  tag. There may not be any change in their viewing experience.

However, people with screen readers and machine web crawlers rely on these descriptive tags to understand the page's content.

To follow best accessibility practices, we must use semantic HTML tags while developing.

## How to use semantic tags in Webflow

Webflow makes it super easy to add semantic HTML tags.

To change an element's tag, do the following:

- Select the element
- Go to the settings panel (D)
- Choose a tag from the dropdown

#### How do I choose which tag to use?

These short descriptions are taken directly from Webflow Designer:

- **Header** - specifies a header for the document or a section
- **Footer** - defines a footer for the document or a section
- **Nav** - defines navigation links in the document
- **Main** - defines the main content of a document
- **Section** - defines a section in the document.
- **Article** - defines an article in the document
- **Aside** - defines content aside from the page content
- **Address** - defines the contact information for the author/owner of a document or an article
- **Figure** - defines self-contained content, like illustrations, diagrams, photos, code blocks, etc.
- **H1-H6** - these elements represent levels of section Headings from highest to lowest

There are many more semantic tags available to us as web developers. The tags above are the most important ones when using Webflow.

## Basic semantic structure

First, we will focus on **Header**, **Main**, and **Footer**.

### Header - 

The header tag is most commonly used to wrap a website's navbar. In Client-First, we would most likely add this tag to our nav_component or an equal.

But, it can also specify the header of a section or an article.

Both of these approaches are correct.

According to W3Schools, we can have more than one  tags on a page. However, a  cannot be placed within a ,  or another  element.

##### The use of  is flexible and used differently throughout the web.

If we inspect other websites, we will see that some developers use the header tag only on the navbar, while others use the header tag multiple times.

For example, if we look at an article on the usa.gov website, we will see that each Heading ( - ) is wrapped with a header tag.

If we look at the article pages of the EU, we will see that only the header is used only to wrap the navbar.

### Main - 

The main tag defines the main content of our page. On most pages, the  tag is used to wrap the "main" content of the page. It's usually everything between the  and the .

The content inside the  element should be unique to the page.

- The  and  should not be included inside the  tag.
- The  tag should not contain any content that is repeated across pages, such as sidebars, navigation links, copyright information, site logos, search forms, or cookie consent.

The most common tags we will see inside the main are sections and articles.

In Client-First, we add the  tag to our *main-wrapper* class.

### Footer - 

A  element usually contains:

- Authorship information
- Copyright information
- Contact information
- Sitemap
- "Back to top" links
- Related documents

The  tag relates to the nearest sectioning parent. That can be either a section or the whole page.

For example, we might have a footer at the bottom of an article that relates to the article. We might have another footer at the bottom of our page that serves as our page footer.

## Sectioning elements

### Section - 

A 
 tag is used for sectioning our web page.

Sections should always have a Heading, with very few exceptions.

In most cases, we will have several sections in our main.

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b8157a5a2f97fb6eb4915_sectionsemantic-html.png)

Here’s a simple example of a website divided into sections.

Note that we can also have sections within an article tag, and vice versa. We can even have sections within sections.

### Article - 

The  tag specifies independent, self-contained content.

An article should make sense on its own, and it should be possible to distribute it independently from the rest of the site.

A common misconception is using  tags only on blog posts.

We can use the  tag on any of the following:

- Forum post
- Magazine
- Newspaper article
- Blog entry
- Product card
- User-submitted comment
- Interactive widget or gadget
- or any other independent item of content.

### Aside- 

The  tag defines some content "aside" from the primary content.

The aside content should relate to the surrounding content.

Use the aside tag to wrap:

- Page related sidebars
- Related links
- Related content
- Advertisements
- Tables of content

The aside element should be inside the related section element. This means that if our aside relates to a section, it should be inside that section.

If our aside relates to the whole page, then place it outside any section tag. For example, we could place next to the .

### Nav - 

The nav element specifies a list of navigation links.

Here are some common places where we want to use the  tag:

- Navbar links
- Sidebar links
- Table of content
- Footer links
- Breadcrumbs

## Headings -  - 

The h1 to h6 elements represent six levels of section Headings.  is the highest section level. and  is the lowest.

### Use only one h1 per page

The  should be the title of our page.

When a user lands on our site and reads the  Heading, they should understand what the page is about. Our  should be descriptive and clear.

### Nesting Headings

Use the  tag to cover subtopics of our .

Use the  tag should be used to cover subtopics of the  and so on.

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b8187182168928fd50a02_nesting-headings.png)

Users with screen readers often jump from Heading to Heading to understand our page.

Because of this, it’s essential not to skip Heading levels. Skipping a Heading level may create confusion, as the person navigating this way may wonder where the missing Heading is.

## Figures, addresses and others.

### Address - 

The  tag specifies contact information for the author/owner of a page or an article.

We can have more than one article tag on a page.

If we place the  tag within an , it refers to the article.

When an address tag is placed outside of an article, then it refers to the whole page.

For example, if we include our company’s address in the footer, the  tag will refer to the whole page (document).

### Figure - 

The 
 tag specifies self-contained content, like illustrations, diagrams, photos, code listings, etc.

While the content of the 
 element relates to the main flow, its position is independent of the main flow. Removing a figure should not affect the flow of the page.

We might have noticed that the 
 tag is automatically added around any Rich Text image or video when we add a description.

We can use this tag to wrap images when we see fit.

Note that the 
 tag is not as crucial for accessibility and SEO as adding **alt text** to the visual content.

## Semantic HTML cloneable

We developed cloneable project that outlines semantic HTML tags inside a Webflow project. The cloneble helps us visualize the correct use of HTML semantic tags.

‍[Get the Semantic HTML cloneable here.](https://finsweet.info/semantic-html-cloneable)
