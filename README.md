# Paperless Web Capture

A Chrome extension that captures web pages and PDFs directly to your [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) server.

Uses Chrome DevTools Protocol's `Page.printToPDF` to render pages as PDFs

Detects when you're viewing a PDF (via `document.contentType`) and fetches the original file bytes directly.
