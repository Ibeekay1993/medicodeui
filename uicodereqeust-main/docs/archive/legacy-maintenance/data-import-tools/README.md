# Archived data import and reconciliation tools

These one-off tools were used to generate historical SQL imports and repair date/code data from source workbooks. They are archived and are not part of the production application or its supported import path. Their source workbooks contain personal health data and must remain in approved private storage; do not add those workbooks or generated patient rows to Git.

The supported beneficiary upload flow is the authenticated portal import using CSV or `.xlsx`. The vulnerable `xlsx` npm package was removed from the application dependencies. These archived scripts may require rewriting with the maintained ExcelJS library before any future reuse.