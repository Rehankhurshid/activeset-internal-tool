---
source: https://finsweet.com/client-first/docs/classes-strategy-1
fetched: 2026-04-01
title: "Classes strategy 1"
---

# Classes strategy 1

## Types of classes

### Utility class

A class created with a specific combination of CSS properties that can be applied to elements globally across the project.

All utility classes are global classes by nature. The concept of a utility class is a class that helps apply global CSS properties inside the project.

For example, we added utility class *background-color-primary* in the Client-First starter project to help us organize and manage commonly used background colors throughout the project.

We added utility class *font-size-large* in the Client-First starter project to help us organize and manage unified typography sizing throughout the project.

**Utility classes will not use an underscore in the class name.**

### Custom class

A custom class created for a specific component, page, grouping of elements, or single element.

We call this a "custom" class because it is custom outside of our project’s utility classes. Custom classes should be created when utility classes can not, or should not, be used on an element. The class is custom to that element.

For example, a class to style a specific element in the global headers for the project, *header_background-layer*.

For example, a class to style a specific element in the testimonial slide, *testimonial-slider_headshot*.

**In Client-First, custom classes use an underscore in the class name.**

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659ae844a5a2f97fb6983b91_custom-classclass-strategy-1.webp)

### Global class

A classification of a class. A global class is intended for use across the entire project. Both utility classes and custom classes can be global classes.

A global class applies styles that will remain unified across the project. A global class is not for a specific instance.

"Global" means everywhere and anywhere in the project.

All utility classes are global classes. Utility classes are global in nature.

For example, our margin and padding classes are global utility classes. *margin-large* has a margin value of 3rem. When we update that value to 4rem, every instance that uses *margin-large* will update to 4rem.

*margin-large* is a global controller that changes the value of our margin and padding across the project. We can make impactful, global changes to our project when we use global utility classes correctly.

Global classes are not limited to utility classes. Global classes are now more clearly defined as **any type of class** that intends to have full-site global management of styles.

In Client-First v2, we better explain and encourage the use of custom classes as global classes.

For example, *faq_item* can be a global custom class. We have many FAQ sections throughout the website, and *faq_item* is used to manage the FAQ items across the entire project.

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659ae867fe2bbc52efd968ea_global-class-1class-strategy-1.webp)

For example, *header_content* can be a global custom class. We have a header component on each page of the project. This class manages this content wrapper customization globally across the entire project.

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659ae87b8ea73e0edfc59aed_global-class-2class-strategy-1.webp)

### Combo class

A combo class is a variant to a base class. A combo class inherits styles from the base class and adds more styles on top of it. 

We define the "base class" as the first class in our list of stacked combo classes in a combo class. We add a class on top of the base class to create a unique variation.

The added class that gives the unique variation uses the class prefix of *is-*.

The stacked combo class will only work when combined with the base class(es) before it. In the video below, understand that *is-brand* does not work alone. It only works as an addition to the base *button* class.

  
  
  
  Sorry, your browser doesn't support embedded videos.

Combo classes can be created from a custom or utility base class. The example above *button* *is-brand* shows a utility class as a combo class.
‍

We can also create a combo class for a custom class. For example, *section_header* *is-home*. This is a variant of the *section_header* custom class.

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659aee881b3593da2875c879_combo-classclass-strategy-1.webp)

#### -is prefix

We define a combo class in Client-First with****the **is-**prefix. When we see *is-* we know this class is created as a combo class on top of a base class.

## Don't deep stack classes

Client-First has a universal rule — don't deep stack.

**Deep stack** — many classes 'stacked' on top of an element.

**Deep stacking** — the action of stacking many classes on top of an element.

This is a term created by Client-First to address the problems we face with stacked classes in Webflow Designer.

Client-First does not recommend the deep stacking strategy in Webflow.

For example:

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659aeeb7cbd8d0f442fc5874_deep-stackclass-strategy-1.webp)

In Client-First, we want to avoid deep stacking classes like this. We will read about avoiding deep stacking throughout the docs.

Here is a quick list of reasons:

### Reasons we don't deep stack.

#### Inability to reorder styles in Designer styles panel.

We don't have free control over stacked classes in Webflow. We are unable to reorder them or properly manage them inside Designer. If we need to change or remove classes in the stacked list, we have to remove all classes from the list before accessing earlier classes.

In the case below, you can see that we have to remove some classes if we want to change the text weight from *text-weight-medium* to *text-weight-bold*:

  
  
  
  Sorry, your browser doesn't support embedded videos.

This problem becomes extreme when making edits at lower breakpoint levels. We have even less editing control as we edit breakpoints outside the base breakpoints.

#### Slower workflow. Requires many steps for small changes

The workflow above is time-consuming. If this is a constant practice in our workflow, it will make our build and maintenance time longer.

#### Increased learning curve.

We believe that deep stacking leads to a steeper learning curve. There is a deeper requirement for understanding what the classes do and how to manage them.

#### Writing CSS in Webflow is fast

Writing CSS is fast and efficient through the Webflow Styles panel. We can create a new class and visually add CSS properties to the class. This process is very fast in Webflow, and we take advantage of it in Client-First.

#### CSS size saving is not too significant

When we use global classes in a project, we can reduce the size of our CSS file. We do not believe these small CSS savings outweigh the benefits of custom class creation inside Webflow.

##### Learn more about deep stacking later: There is a full explanation of each of these points in Classes strategy 2.

## Use custom classes

Custom classes are a powerful and recommended method inside Client-First.

We use custom classes for these purposes

- Easy edits for specific elements. If we use an organized custom class system, we can make rapid unique changes to specific elements and components in our project.
- To avoid the use of utility classes **everywhere** in our project. Utility class systems are powerful but should not be used to build the entire project. When using a utility class makes our job as Webflow developers more complicated, we encourage the creation of a custom class. There should be a clear benefit to using a utility class.
- To avoid deep stacking. Deep stacking can be replaced with a custom class.

### Background texture example

For example, we want to style the background texture on a component.

We may be able to style our background texture with three stacked classes. For example, *background-absolute* + *fit-size* + *opacity-low*. When combined, these three classes give us the style combination we need.

Instead of stacking multiple classes for this background texture, we can create a custom class called *services-item_background-texture*. The class clearly states that this class is for "a texture that’s on a background image of a services item."

We can now quickly and more freely make edits to this custom class instead of re-organizing the stacked classes. If we need a unique styling, we have a custom class ready to accept that unique styling.

### Traditional CSS development

In traditional CSS development, a stacked class solution may be the better solution. Stacked classes will require less CSS to write by hand, which will lead to faster development.

However, this is not traditional CSS development. This is Webflow. Client-First is a collection of principles created specifically for Webflow.

##### In Webflow, we believe it takes less time and effort to create and manage styles of a custom class on an element than managing a deep stacked class list.

There is a full explanation of custom class creation in [Classes strategy 2](https://finsweet.com/client-first/docs/classes-strategy-2).

## Naming convention

Create clear and specific names for classes.

A Webflow developer, client, or anyone should understand what the class is doing based on the class name, even if they've never heard of Client-First before.

### Naming mindset

#### Goals of Client-First naming convention

- Empower a non-technical person to manage our website.
- Be clear, informative, and descriptive in our class naming.
- Give the reader as much context into the purpose of that class.
- Read a class name and know what its purpose is.
- No abbreviations, no shorthand, no confusion.
- Give as much context into the relationship of that class with the website.
- Create names based on organization techniques.
- Use keywords to search for available classes inside the Styles panel.
- Visualize what a class' purpose is based on its name.

#### Questions to ask ourselves when naming classes

Class names should say what they do. When creating a name for a class, we can think of these questions:

- **"What is this class doing in the project?"**
- **"What is the purpose of this class in the project?"**
- **"How can I give the most context into what this class is responsible for in the project?"**

The name of a class should answer these questions.

A Webflow developer, client, or marketer should be able to understand what the class is doing based on a class name, even if they're never heard of Client-First before.

### Meaningful names and keywords

A strong keyword gives us context into what this class/element is doing. Being as descriptive as possible in our naming will help us stay organized.

Keywords and clear naming are deep core concepts of Client-First. Each class name should serve a meaningful purpose. We should give the next person who enters the project as much context into the purpose of the class.

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659aeecf3f6e35df56cc4f28_meaningful-namesclass-strategy-1.webp)

### Keywords go from general to specific within a class name

Let's look at *text-size-large* as an example.

The most general keyword in this class name is *text*. This word tells us that this class has to do with a text element.

*size* tells us we are working with customizing the size of the text. The word "size" is more specific as it relates to a particular CSS property of the text — font-size.

Last we have *large*, which gives us more specific information about the value of the text size. It's a large text size.

Notice how we are **not** calling this class *large-size-text*. Although this may be equally as clear as *text-size-large*, we have significant benefits in Client-First when we follow a general-to-specific class naming convention. We enable more intelligent class search and clean Folders organization. We will learn more about this throughout the docs.

Let's look at an example using a custom class, *team-list_headshot-wrapper*.

The folder name is *team-list_*, which tells us this element has something to do with the team page or a team section and is a list. "Team list" is the name of the group containing the specific elements.

*headshot* is getting more specific and telling us that this has something to do with the headshot element within the team list.

*wrapper* is getting even more specific and telling us this is wrapping the headshot.

Reading the class name *team-list_headshot-wrapper* is clear and logical, even if the user doesn't understand the CSS behind it. The user would understand that editing this class will do [something] to the team list headshots. That's an excellent hint for the next person who enters the project.

Now imagine adding more elements inside our headshot wrapper. We can stay very organized with a general-to-specific naming convention.

*team-list_headshot-wrapper*
*team-list_headshot-image*
*team-list_headshot-texture-layer*
*team-list_headshot-background*

Our list of classes for the team list is very organized and logical inside our project. This naming convention integrates very well into our Folders feature.
