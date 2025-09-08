// ==UserScript==
// @name         Cursor Cost Analysis Summary
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Adds cost summary below "All Events" in Cursor dashboard
// @author       You
// @match        https://cursor.com/dashboard*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Script] Cursor Cost Analysis script starting...');

    // Wait for the page to load and the table to be populated
    function waitForTable() {
        return new Promise((resolve) => {
            console.log('[Script] Waiting for table to load...');
            const checkTable = () => {
                const table = document.querySelector('table tbody');
                console.log('[Script] Checking for table:', table ? 'found' : 'not found');
                if (table) {
                    console.log('[Script] Table found, rows count:', table.children.length);
                }
                if (table && table.children.length > 0) {
                    console.log('[Script] Table loaded with', table.children.length, 'rows');
                    resolve();
                } else {
                    setTimeout(checkTable, 100);
                }
            };
            checkTable();
        });
    }

    // Function to extract numeric value from text (e.g., "79K" -> 79000)
    function parseTokenCount(text) {
        if (!text) return 0;
        const cleanText = text.replace(/[^\d.KMB]/g, '');
        const num = parseFloat(cleanText);
        if (cleanText.includes('K')) return num * 1000;
        if (cleanText.includes('M')) return num * 1000000;
        if (cleanText.includes('B')) return num * 1000000000;
        return num;
    }

    // Function to extract cost from the cost cell
    function extractCost(costCell) {
        const costText = costCell.textContent;
        // Look for dollar amounts in the format $X.XX
        const match = costText.match(/\$(\d+\.?\d*)/);
        return match ? parseFloat(match[1]) : 0;
    }

    // Function to check if an event is included
    function isIncludedEvent(kindCell) {
        return kindCell.textContent.trim().toLowerCase() === 'included';
    }

    // Function to get all data by setting max pagination and collecting all pages
    async function getAllTableData() {
        console.log('[Script] Getting all table data...');
        
        // First, try to set the pagination to maximum (500 rows per page)
        const rowsPerPageSelect = document.querySelector('select[data-sharkid]');
        console.log('[Script] Pagination select found:', rowsPerPageSelect ? 'yes' : 'no');
        
        if (rowsPerPageSelect) {
            // Set to 500 if available, otherwise 250
            const maxOption = rowsPerPageSelect.querySelector('option[value="500"]') || 
                             rowsPerPageSelect.querySelector('option[value="250"]') ||
                             rowsPerPageSelect.querySelector('option[value="100"]');
            if (maxOption) {
                console.log('[Script] Setting pagination to:', maxOption.value);
                rowsPerPageSelect.value = maxOption.value;
                rowsPerPageSelect.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Wait a bit for the table to update
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('[Script] Pagination updated, waiting for table refresh...');
            }
        }

        // Collect all visible data
        const table = document.querySelector('table tbody');
        if (!table) {
            console.log('[Script] No table found!');
            return [];
        }

        console.log('[Script] Table found, collecting data from', table.children.length, 'rows');
        const allData = [];
        const rows = table.querySelectorAll('tr');

        rows.forEach((row, index) => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 5) {
                const date = cells[0].textContent.trim();
                const model = cells[1].textContent.trim();
                const kind = cells[2].textContent.trim();
                const tokens = cells[3].textContent.trim();
                const cost = cells[4].textContent.trim();

                const parsedTokens = parseTokenCount(tokens);
                const extractedCost = extractCost(cells[4]);
                const isIncluded = isIncludedEvent(cells[2]);

                if (index < 3) { // Log first 3 rows for debugging
                    console.log('[Script] Row', index, ':', { date, model, kind, tokens, cost, parsedTokens, extractedCost, isIncluded });
                }

                allData.push({
                    date,
                    model,
                    kind,
                    tokens: parsedTokens,
                    cost: extractedCost,
                    isIncluded
                });
            }
        });

        console.log('[Script] Collected', allData.length, 'rows of data');
        return allData;
    }

    // Function to calculate summary statistics
    function calculateSummary(data) {
        console.log('[Script] Calculating summary for', data.length, 'events');
        
        const includedEvents = data.filter(event => event.isIncluded);
        const totalIncludedCost = includedEvents.reduce((sum, event) => sum + event.cost, 0);
        const totalTokens = data.reduce((sum, event) => sum + event.tokens, 0);
        const totalEvents = data.length;

        // For avg cost per 100k tokens, use only included events' tokens since only they have costs
        const includedTokens = includedEvents.reduce((sum, event) => sum + event.tokens, 0);
        const avgCostPer100kTokens = includedTokens > 0 ? (totalIncludedCost / includedTokens) * 100000 : 0;
        const avgCostPerEvent = totalEvents > 0 ? totalIncludedCost / totalEvents : 0;

        // Debug: Check what kinds of events we have
        const eventKinds = {};
        data.forEach(event => {
            const kind = event.kind;
            eventKinds[kind] = (eventKinds[kind] || 0) + 1;
        });
        console.log('[Script] Event kinds breakdown:', eventKinds);

        console.log('[Script] Summary calculated:', {
            totalIncludedCost,
            avgCostPer100kTokens,
            avgCostPerEvent,
            totalEvents,
            totalTokens,
            includedTokens,
            includedEventsCount: includedEvents.length
        });

        return {
            totalIncludedCost,
            avgCostPer100kTokens,
            avgCostPerEvent,
            totalEvents,
            totalTokens,
            includedEventsCount: includedEvents.length
        };
    }

    // Function to create and insert the summary
    function createSummary(summary) {
        console.log('[Script] Creating summary display...');
        
        // Find the "All Events" heading and the table
        const allEventsHeading = Array.from(document.querySelectorAll('p')).find(p => 
            p.textContent.includes('All Events')
        );
        
        console.log('[Script] All Events heading found:', allEventsHeading ? 'yes' : 'no');
        if (!allEventsHeading) {
            console.log('[Script] Could not find All Events heading, available p elements:', 
                Array.from(document.querySelectorAll('p')).map(p => p.textContent.trim()));
            return;
        }

        // Check if summary already exists
        const existingSummary = document.querySelector('.cursor-cost-summary');
        if (existingSummary) {
            console.log('[Script] Removing existing summary');
            existingSummary.remove();
        }

        // Create summary container
        const summaryContainer = document.createElement('div');
        summaryContainer.className = 'cursor-cost-summary mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800';
        
        const avgCostPerEventValue = (summary.avgCostPerEvent || 0).toFixed(4);
        console.log('[Script] avgCostPerEventValue for display:', avgCostPerEventValue);
        
        summaryContainer.innerHTML = `
            <div class="flex items-center gap-2 mb-2">
                <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                </svg>
                <h3 class="text-sm font-semibold text-blue-800 dark:text-blue-200">Cost Summary</h3>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div class="bg-white dark:bg-gray-800 p-3 rounded border">
                    <div class="text-gray-500 dark:text-gray-400">Total Included Cost</div>
                    <div class="text-lg font-bold text-green-600 dark:text-green-400">$${summary.totalIncludedCost.toFixed(4)}</div>
                </div>
                <div class="bg-white dark:bg-gray-800 p-3 rounded border">
                    <div class="text-gray-500 dark:text-gray-400">Avg Cost per 100k Tokens</div>
                    <div class="text-lg font-bold text-blue-600 dark:text-blue-400">$${summary.avgCostPer100kTokens.toFixed(2)}</div>
                </div>
                <div class="bg-white dark:bg-gray-800 p-3 rounded border">
                    <div class="text-gray-500 dark:text-gray-400">Avg Cost per Event</div>
                    <div class="text-lg font-bold text-blue-600 dark:text-blue-400">$${avgCostPerEventValue}</div>
                </div>
                <div class="bg-white dark:bg-gray-800 p-3 rounded border">
                    <div class="text-gray-500 dark:text-gray-400">Total Events</div>
                    <div class="text-lg font-bold text-blue-600 dark:text-blue-400">${summary.totalEvents}</div>
                    <div class="text-xs text-gray-400 mt-1">${summary.includedEventsCount} charged, ${summary.totalEvents - summary.includedEventsCount} not charged</div>
                </div>
            </div>
            <div class="mt-2 text-xs text-gray-600 dark:text-gray-400">
                Total tokens: ${summary.totalTokens.toLocaleString()} | 
                Last updated: ${new Date().toLocaleTimeString()}
            </div>
        `;

        // Insert the summary after the "All Events" heading but before the table
        const parent = allEventsHeading.parentElement;
        const tableContainer = parent.querySelector('.overflow-x-auto');
        console.log('[Script] Parent element found:', parent ? 'yes' : 'no');
        console.log('[Script] Table container found:', tableContainer ? 'yes' : 'no');
        
        // Insert the summary after the parent div that contains "All Events"
        if (parent.nextSibling) {
            parent.parentNode.insertBefore(summaryContainer, parent.nextSibling);
            console.log('[Script] Summary inserted after All Events parent div');
        } else if (tableContainer) {
            parent.insertBefore(summaryContainer, tableContainer);
            console.log('[Script] Summary inserted before table container');
        } else {
            parent.parentElement.appendChild(summaryContainer);
            console.log('[Script] Summary appended to grandparent element');
        }
        
        console.log('[Script] Summary display created successfully');
    }

    // Main function to run the analysis
    async function runAnalysis() {
        console.log('[Script] Starting analysis...');
        try {
            await waitForTable();
            const data = await getAllTableData();
            const summary = calculateSummary(data);
            createSummary(summary);
            console.log('[Script] Analysis completed successfully');
        } catch (error) {
            console.error('[Script] Error in Cursor Cost Analysis:', error);
        }
    }

    // Run the analysis when the page loads
    console.log('[Script] Document ready state:', document.readyState);
    if (document.readyState === 'loading') {
        console.log('[Script] Document still loading, waiting for DOMContentLoaded');
        document.addEventListener('DOMContentLoaded', runAnalysis);
    } else {
        console.log('[Script] Document already loaded, running analysis immediately');
        runAnalysis();
    }

    // Also run when the table might be updated (e.g., after pagination changes)
    console.log('[Script] Setting up mutation observer for table changes');
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                const addedNodes = Array.from(mutation.addedNodes);
                const hasTableChanges = addedNodes.some(node => 
                    node.nodeType === 1 && (
                        node.tagName === 'TBODY' || 
                        node.querySelector && node.querySelector('tbody')
                    )
                );
                
                if (hasTableChanges) {
                    console.log('[Script] Table changes detected, re-running analysis');
                    setTimeout(runAnalysis, 500); // Small delay to ensure table is fully loaded
                }
            }
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    console.log('[Script] Mutation observer set up successfully');

})();
