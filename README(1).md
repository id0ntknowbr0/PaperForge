# PageForge

**A free, web-based book layout editor for journals, notebooks,
planners, and other low-content books.**

PageForge is an open-source project exploring an accessible alternative
to paid book-design tools. It provides a focused workspace for designing
book interiors, organizing pages, choosing index layouts, and preparing
documents for PDF export.

> **Project status:** Under active development. Features and
> print-export behavior may change as the project evolves.

## Features

-   **Browser-based editor** --- design book layouts through a visual
    workspace.
-   **Page management** --- view and organize pages using thumbnails and
    page controls.
-   **Interior templates** --- layouts for lined pages, journals,
    planners, and other notebook formats.
-   **Index templates** --- including a table of contents, bullet
    journal index, numbered reference index, alphabetical directory,
    category index, and project log.
-   **Print layout guides** --- configure page dimensions, margins, trim
    guides, and bleed.
-   **Project dashboard** --- access and manage book projects.
-   **PDF export** --- prepare book layouts for printing, subject to the
    capabilities of the current build.
-   **Dark interface** --- a focused editor with a central canvas and
    surrounding tool panels.

The availability and completeness of individual features depend on the
current implementation.

## Technology

PageForge is built as a web application using:

-   React
-   TypeScript
-   Tailwind CSS, if configured in the current project
-   The build tooling and PDF-generation libraries used by the project

The website is intended to be used through a web browser. Visitors
should not need to install a desktop application to use the hosted
website.

## How to Use PageForge

1.  Open the PageForge website.
2.  Create a new book project or open an existing project.
3.  Choose the page size and document settings.
4.  Add, select, and organize pages using the page panel.
5.  Apply an available interior or index template.
6.  Adjust the layout using the editor and page guides.
7.  Export the document to PDF if export is available in the current
    version.
8.  Review the exported PDF at its actual dimensions before printing or
    publishing.

## Index Templates

PageForge includes a growing collection of index layouts, including:

-   Classic Table of Contents
-   Bullet Journal Index
-   Numbered Reference Index
-   A--Z Alphabetical Directory
-   Category & Subject Index
-   Project & Archive Log

Potential additions include monthly, glossary, reading, recipe, study,
and collection indexes.

## Print and Amazon KDP Notes

PageForge is designed with print-oriented book layouts in mind. Before
uploading a document to Amazon Kindle Direct Publishing (KDP) or another
print service:

-   Confirm the required trim size.
-   Verify margins and bleed against the printer's current
    specifications.
-   Check page order, page count, and content near trim boundaries.
-   Inspect fonts, lines, images, and other elements in the exported
    PDF.
-   Validate cover dimensions and spine width separately from
    interior-page dimensions.

Do not assume every export is automatically KDP-compliant. Always review
the exported file against the requirements for the specific book and
printing options.

## Roadmap

Potential areas of development include:

-   [ ] More customizable interior and index templates
-   [ ] Bulk generation of notebook pages
-   [ ] Improved text and object editing
-   [ ] Drag-and-drop page reordering
-   [ ] Reliable project saving and recovery
-   [ ] Undo and redo across editing operations
-   [ ] Print validation and export improvements
-   [ ] Linked index entries and page references
-   [ ] Improved accessibility and responsive layouts

The roadmap may change as the project develops.

## Contributing

Contributions, bug reports, and feature suggestions are welcome.

1.  Fork the repository.
2.  Create a branch for your change.
3.  Make your changes and test them.
4.  Submit a pull request with a clear description of the improvement.

For larger changes, consider opening an issue first to discuss the
proposed approach.

## Issues and Feedback

If you find a bug or have an idea for improving PageForge, open an issue
in the GitHub repository. Include steps to reproduce bugs and
screenshots when they help explain the problem.

## License

Choose and add an open-source license before inviting others to reuse,
modify, or redistribute the code. Until a license is added to the
repository, others should not assume they have permission to reuse,
modify, or redistribute it.

------------------------------------------------------------------------

**PageForge** --- Create, organize, and prepare book layouts in one
online workspace.
