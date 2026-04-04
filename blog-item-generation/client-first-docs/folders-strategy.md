---
source: https://finsweet.com/client-first/docs/folders-strategy
fetched: 2026-04-01
title: "Folders strategy"
---

# Folders strategy

## Intro

Most of this article is about the strategies we can take to use custom class folders.

Projects are different.

- Projects have different requirements.
- Projects vary in design and layout style
- Projects may have different post-project maintenance strategies.

These factors can go into our folder naming strategy for the project.

Folders was built to offer flexibility in how we name and organize classes. Remember that Client-First is "One naming convention for every project." We mean it when we say it. For this to be true, we need flexibility in our folder organization system.

##### There is often no right or wrong to class naming. There is only more and less efficient.

High efficiency in Webflow is achieved when our build strategy is customized for the project we are developing.

#### Examples below

Below we show many different naming strategies with different folder organization styles.

It's important to understand that we should not use all of the strategies in a single project. We can use multiple strategies, but not all strategies.

There should be unification of naming conventions when we implement our folder system. Much like the files on our computer, it's best if we have a planned structure that unifies the organization of the files.

We recommend having a plan for the folder naming convention before we start developing.

Let's review each example and explain when we may want to use it.

## Types of folder organization

### One folder

#### One folder level, general folder name

Helpful in creating components that are not specific to any page or content.

When naming is general, it is clearer that the folder is used globally throughout the project.

General naming is great for recurring core elements in the project.

*one-folder_name-of-element*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7e0d8861b35ea6c7e8da_one-folder-general.webp)

#### One folder level, specific folder name

Helpful in creating any type of custom folder, regardless of project size.

Add the page name to give context to its relation to the page.

Add content-specific keywords to provide more information about the purpose of the class.

Specific naming works well for smaller custom websites that don't require much global organization.

Specific naming is ideal for sections, components, and elements created for a certain page or instance.

*one-specific-folder_name-of-element*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7e1be70ccba2b8dcef84_one-folder-specific.webp)

#### One folder level, page name as folder name

Helpful in creating a folder of classes specific to an identifiable page.

If we are creating a new page, and that page has custom components different from the rest of the site, we can organize these components inside a single page folder.

A page folder is a good strategy when there aren't many custom classes for the page, and the custom classes are created for the page they are named after.

*page-folder_name-of-element*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7e2af6c98b40e86261cf_one-folder-page.webp)

##### Important: Do not use page name folder organization and reuse the class on other pages. This will lead to an unorganized and confusing class system. Instead, if we use a class across multiple pages, use the "One folder level, specific folder name" strategy. When using the page name strategy, we must only use the class on that page.

‍

#### One folder level, page name as element prefix

Helpful in creating unique variations of a component by page while still staying in the folder structure for the component.

For example, every slider in the project has the same styles applied to it. The homepage has a unique variation of the arrow UI. This variation is not enough to call the component a unique slider or to create an entirely different folder specifically for this variation. It is styled like the rest of the sliders, with a few exceptions.

We want to continue to manage all slider components inside the *slider_* folder.

We can use a page prefix as the first keyword of the element identifier to identify the purpose of the new class in the *slider_*folder.

We identify the homepage instance without creating a new folder for our slider component.

*one-folder_page-name-element*
*slider_culture-pane*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7e3d1c8bcc13b968d1f7_one-folder-prefix.webp)

Can't we use a combo class for this? *slider_pane* *is-culture*

Yes, a combo class can be used instead of this strategy. A combo class may be the right decision.

There may be a reason why we do not want to use a combo class implementation for this variation. For example, we do not need to inherit the styles from *slider_pane*. More information about intelligent combo class use in [Classes strategy 2.](https://finsweet.com/client-first/docs/classes-strategy-2)

### Nested folders

Helpful in larger sites with more complex organization requirements.

Using two folder levels, or nested folders, does not have to be a site-wide strategy for every element.

We can use nested folders in a few folders. We can use them for one specific use case.

##### Just because we have the power of nested folders doesn't mean we should always use them. Only nest folders when there is a clear organizational win.

#### Nested folders, page folder first

Helpful in identifying a collection of components by page name first.

If the components on each page are unique, and we want to find them based on their page, this strategy can help us.

If we see our website's pages as the best way to organize components, this strategy can help us.

‍*page-folder_keyword-folder_name-of-element*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7e4b359714d42a12ae63_nested-folders-page.webp)

#### Nested folders, keyword folder first

Helpful in identifying a component by keyword first, then by page name.

If the same component category has unique variations on many different pages, we may want to use the component as the base organization.

When navigating to the component's folder, we can view all of the pages where component has unique instances.

*keyword-folder_page-folder_name-of-element*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7e6e5243ed5b2cc764f8_nested-folders-keywords.webp)

#### Nested folders, any organization

We thrive on flexibility.

Above we see clear use cases, but it's a fact that not every naming decision is clear. Sometimes we can fit perfectly into one of the above strategies. Sometimes we need to do something different to accommodate our use case.

We can use folders for anything. There are no strict rules when it comes to custom class naming conventions.

Any organization is accepted as long as it's clear what the organization strategy is accomplishing.

‍*anything_anything_name-of-element*

## Page name in class name

The decision to add a page name to a class name is powerful. Below we will go through questions to ask ourselves with each project.

We can give more clarity and context to our components by adding the page's name. We can tell ourselves, and the next developer, that **this class is specific to a page**.

We can give equally as much context by****not using the page name for our components. We can tell ourselves, and the next developer, that **this class is not specific to a page and can be used globally on any page**.

#### Flexible options using page name

- Page names can go in the folder name.
- Page names can go in the element identifier.
- Keywords can be mixed with page names in both the folder name and identifier.

With this flexibility, we can organize our projects based on our needs.

Remember that adding the page name is our decision. Our ultimate end goal is to create a project that makes our job easier and allows the following user to edit the Webflow project effectively. If the context of the page name will help us use the project better, then add the page name.

To make better decisions for page name use, we can ask ourselves these questions:**‍**

#### Is this element styled for this page only?

If a class is created for a particular page, it may be best to use that page name in the class name.

The class has a specific purpose of doing [something] to an element on that particular page.

Adding the page name gives context to the purpose of this class.

Here we show three examples of page names in the class name. Each example has two naming options — one folder level and two folder levels.

*page-component_element-name* or *page_component_element-name*

‍

‍**‍**1. *home-slider_arrow* or *home_slider_arrow*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7e86458eb201f132f778_page-example-1.webp)

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7e96094eaac10eae961b_page-example-2.webp)

‍**‍**

**‍**2. *team-slider_arrow* or *team_slider_arrow*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7eab046a0c4cb51b8d22_page-example-3.webp)

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7ebab585c53b9b4188ec_page-example-4.webp)

‍

‍

‍**‍**3. *portfolio-slider_arrow* or *portfolio_slider_arrow*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7eceb5b63478cc41eaed_page-example-5.webp)

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7ed84361f0f1382e86e0_page-example-6.webp)

‍

With the page name in the class name, we can assume that this class is specific to this page. It will not conflict with other pages. We can edit the class knowing we are editing this specific page instance.

#### Is this a reusable element throughout the project?

If reusing components and elements across the project is required for our build, it may be best not to use the page name in these class names.

We may be best using the keyword as the base level folder name.

We don't want to define our components as specific to a page if the component is not specific to a page.

If the class is meant to be used elsewhere in the project, or has the potential to be used elsewhere in the project, it may not be best to use the page name.

Here we show several examples of reusable elements that are not specific to a page. Their naming is general enough to make it clear they are reusable.

*specific-topic_element-name*

‍
*slider_arrow*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7ef0faadfb8ed9238cab_reusable-elements-1.webp)

‍
*header_image-right*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7efbb26b3fb0ceead196_reusable-elements-2.webp)

‍
*subscribe_form-input*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7f09e70ccba2b8dd5533_reusable-elements-3.webp)

‍
*clients-logos_row*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7f1a524adf76bf3bee2e_reusable-elements-4.webp)

When naming is very general, with no page name present, we can make better assumptions as a new developer entering the project.

The class *slider_arrow* is very general and can likely be used on all or most sliders. With the Styles panel stats, we can see this used 2 times on this page and on 4 other pages. We have enough information to assume this is a reusable element in our project.

If we were building a new page in the project, we would be comfortable using this class without renaming it. We would also be sure not to accidentally edit other instances with styles unique to the new page.

Class naming with a general keyword gives context to this class's impact on the project.

#### When to use page name (or specific keyword) as the element prefix?

Let's continue with the example in the previous section. We have our *slider_* folder that is intended for use across our project.

Imagine there is a variation of the slider on the testimonials page instance. The testimonials page testimonial has a different arrow visual. It is a variation that is unique from the default *slider_arrow*. Everything about it is different.

This testimonials slider shares all of the core styles of the slider component, except for the arrows. Since it is such a minor variation from the entire component, it does not make sense to rename everything as the *testimonials-slider_ component*. We still want to use our default slider styles to stay consistent across the project.

The variation is not significant enough to create a unique component or a new folder. We only need custom arrows for the testimonials page.

We can use combo classes or a new custom class with the page name as the element prefix.

First, we will show the custom class approach.

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7f2872733929624216f0_prefix-example.webp)

This shows the slider component with two testimonial-specific classes. We are not creating a unique folder. We are further specifying the element inside the *slider_* folder.

Both *slider_testimonials-arrow* and *slider_testimonials-arrow-trigger* use the word **testimonials** as the first keyword of the element name.

The "testimonials" keyword tells us the slider element is specific to a testimonials instance.

#### Unclear if something is a page name or keyword name

##### Page names can be mistaken for keyword names — or keyword names be mistaken for page names.

We may not always have 100% clarity on a page name vs. a keyword name. However, the principles of naming still help us maintain an organizational strategy.

For example, *testimonials_slider* use "testimonials" as a keyword or page name.

We may have a client page with a testimonials slider.

We may have a testimonials page with a slider.

This class may exist on many pages and represent the slider that holds many types of testimonials.

We, as the project developer, may know what *testimonials_* mean. However, others viewing the site after us may not have complete clarity.

There is no magic fix to identifying the keyword and what it means for every class. It is challenging to make every class in our project 100% clear, regardless of the naming convention we use.

However, we want to reach the as much clarity as possible. This is why we have the Client-First system in place.

Sometimes there are naming conflicts, and that's ok.

##### As long as we create names that give the most context into the class, we are following Client-First and providing a powerful level of organization to our project.

## One folder vs. two folders

We must use Client-First Folders with purpose.

Just because we can nest folders doesn't mean we should always nest folders. The size of our project and the level of organization required should be the two core factors in the decision for levels of folder nesting.

If our *testimonials_* folder has 100 different items across different instances, it may make sense to use a nested folder to organize these classes further. It may be beneficial to have an additional "layer" of organization for those 100 different items.

If our *clients_* folder has 12 items, it may not make sense to have a nested folder. Do we need to organize the 12 items further? Maybe, but likely not.

The decision to use one or two folder levels for our project is entirely up to us.

Understand that we can have parts of our project that use one folder level and other parts that use two folder levels. We can customize the amount of folders in any way that we want.

#### Example using computer analogy

Let's look at an example using the computer folder analogy.

**Example:** We have an excel file with all our university test scores. We need to organize this file on our computer.

> We have base level folders "Personal", "School", "Side-hustle", and "Work".

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7f405243ed5b2cc7cb9a_computer-analogy-1.png)

>> Inside the "School" folder we have "Masters Degree" "Primary", "University".

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7f4f62d6ada43492a9ac_computer-analogy-2.png)

>>> Inside the "University" folder we see our file "university-test-scores.xls".

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7f5cb585c53b9b41d7fc_computer-analogy-3.png)

This is a folder structure that makes sense for a lot of personal computers. Different parts of our life get a different base level folder.

Inside our "School" folder, there are hundreds of files inside each of the "Primary", "University" and "Master's Degree" folders.

Trying to group all of the files into one single folder called "School" may not be organized.

If we wanted to find files specific to "University" it would be difficult if all three schooling levels were in the same folder.

Finding one file out of hundreds of files would be difficult. Creating the second level of folders gives us a deeper organization that works well in this use case.

Now imagine a personal computer of a young primary school student. They don't have work or a side-hustle. They only have "School" and "Personal".

There are fewer files on the primary school student's computer than on the master's degree student who has been using their computer since primary school.

For our young high school student:

> We have base level folders "School" and "Personal"

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7f6b80468e6edfcf501d_computer-analogy-4.png)

>> Inside "School", we have 12 files. The student doesn't have many files for school. We can easily find our file "geography-test-scores.xls" among those 12 files.

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7f789412465c8a5ba190_computer-analogy-5.webp)

If we followed the master's student folder structure for these 12 files, finding the file might be more challenging.

More clicks and more thinking about how the files are organized. If we don't need a nested folder to create further organization, we should not use a nested folder.

Nested folders should help us work quicker, not slower.

## Component libraries

Component libraries, like Relume Library, may benefit from nested folders — or maybe many nested folders.

Folders introduce a massive organizational upgrade to component libraries of all sizes. We will show an example of this with a component library use case.

In a component library, we may want to organize classes like this:

*slider1_component*
*slider2_component*
*slider3_component*
*grid1_component*
*grid7_component*
*logo-row1_component*
*logo-row2_component*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7f85524adf76bf3c1afb_components-library-1.webp)

There's no proper way to name components in a component library to be instance-specific.

A component library intends to create reusable components that can be used anywhere in our project.

If a component library has 100 components, we would see 100 folders in our virtual folder system. This list may not be very easy to navigate.

Adding one underscore can better organize our components to handle variations and options.

The same classes have been re-written to include a nested folder with the variation number.

*slider_1_component*
*slider_2_component*
*slider_3_component*
*grid_1_component*
*grid_7_component*
*logo-row_1_component*
*logo-row_2_component*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7f8fa5a2f97fb6ea72e3_components-library-2.webp)

Look at the beautiful output this naming convention gives.

We can organize all of our component types as base level folders. As we click into each folder, we see how many option variations are available. Each variation is clearly defined and organized in its folder.

For extra super large component libraries with many variations, it may be smart to use three folder levels — nested nested folders.

### Power renaming with Finsweet Extension

Once the component is in our primary project, we can rename the entire folder with [Finsweet Extension](https://www.finsweet.com/extension/).

Using Finsweet Extension, we can bulk rename any folder name.

This means we can copy*****layouts_grid_1_* into our project and bulk rename every element in this folder as *team-grid_*. This bulk folder renaming takes seconds inside the extension.

More information about Finsweet Extension capabilities on the [Folders](https://finsweet.com/client-first/docs/folders) page.

## Using the component keyword

The initial V1 release of Client-First defined components as this:

Components in Client-First are a group of page elements that create a complete UI element. For example, a newsletter signup, team grid, pricing calculator, reusable 3 column grid, or a clients list.

Components in Client-First have always been defined as using an underscore in the class name.

All of this is still true. In this folders update, we will be more specific when we are using components — and more precise when using underscores!

**V1 Initial release‍**underscore in class name = component

**V2 release with Folders‍**underscore in class name = folder 
[folder-name]_component = component

Using a folder underscore in the class name does not necessarily mean the folder is a component. We now use underscores for organization or groupings of elements in Folders.

Components now have a specific classification. If we want an element to be a component, we use the word **"component"**for the element identifier.

##### Using the component keyword tells us that this folder represents a component — a group of page elements that create a complete UI element.

We can think of components as a complete structure that we can copy-paste. We copy the entire structure from the *_component* class.

For example, we may have a clients slider on our website. We consider this clients slider a component. On the parent wrapper of all elements of the clients slider, we would add our component keyword.

*client-slider_component*
*client-slider_mask*
*client-slider_grid*
*client-slider_arrow*

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b7fa121eecb2ee0ee8acb_components-library-3.webp)

This tells us that the *clients-slider_* folder is a component.

Not everything needs to be a component. Structures like newsletter signup, team grid, pricing calculator, or clients list are all great examples of components.

Sometimes we will want to use folders for groupings other than components.

For example, a style guide folder. If our Webflow project uses a style guide, we will likely need to create classes for the style guide. The style guide classes may be on one page. The classes may be used across several pages.

To organize our style guide classes, we can put the classes in a folder specifically for organizational purposes.

*styleguide_structure*
*styleguide_content*
*styleguide_item*
*styleguide_sidebar*

Our style guide page is not a component. It's simply an organization of elements.

Adding the *_component* keyword is always optional. As developers, we decide to add a component 'tag' as the element identifier of the class name.

## Folder decision making tree

There are many decisions to be made when we are organizing our project.

Some of the decisions can be made before we start developing.

Many decisions will be made as we are developing.

It may be time-consuming when we first start making folder naming decisions. Making rapid and intelligent naming decisions comes with practice.

Understand that making naming decisions for folders is something we will improve on as we continue using Client-First.

Our speed and accuracy will improve as we continue to use the Folders feature in our projects.

We have developed a decision making tree to help us understand how to make quick decisions about class organization.

[View the Folders decision PDF](https://cdn.prod.website-files.com/60f51550d69dbad0b4e158eb/630ddb9f8d845aec043c0aed_Client-First%20Folder%20Decision%20Tree.pdf).

It may have taken a few minutes to read this graphic. We will not need a few minutes to make decisions with each name. As we continue to apply this logic to our class naming decisions, we will make these decisions faster.

We can quickly make these complex decisions with practice, trial, and error.

Is there a question that was not answered in the docs? [Let us know on Twitter](https://twitter.com/thatsfinsweet).
