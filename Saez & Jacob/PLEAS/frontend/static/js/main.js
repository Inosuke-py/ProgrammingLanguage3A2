// PLEAS System - Main JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function(el) { return new bootstrap.Tooltip(el); });

    // Code editor tab support
    const codeEditor = document.getElementById('code-editor');
    if (codeEditor) {
        codeEditor.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.selectionStart;
                const end = this.selectionEnd;
                this.value = this.value.substring(0, start) + '    ' + this.value.substring(end);
                this.selectionStart = this.selectionEnd = start + 4;
            }
        });
    }

    // File upload handler
    const fileInput = document.getElementById('id_file_upload');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file && codeEditor) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    codeEditor.value = event.target.result;
                };
                reader.readAsText(file);
            }
        });
    }

    // Range slider value display
    document.querySelectorAll('input[type="range"]').forEach(function(slider) {
        const display = document.createElement('span');
        display.className = 'badge bg-primary ms-2';
        display.textContent = slider.value;
        slider.parentNode.appendChild(display);
        slider.addEventListener('input', function() {
            display.textContent = this.value;
        });
    });

    // Animate elements on scroll
    const animateElements = document.querySelectorAll('.animate-in');
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.style.animationDelay = '0.1s';
                entry.target.classList.add('visible');
            }
        });
    });
    animateElements.forEach(function(el) { observer.observe(el); });
});

// Chart helper functions
function createBarChart(canvasId, labels, data, title, colors) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    return new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: title,
                data: data,
                backgroundColor: colors || 'rgba(79, 70, 229, 0.7)',
                borderColor: colors || 'rgba(79, 70, 229, 1)',
                borderWidth: 1,
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, title: { display: true, text: title, font: { size: 14, weight: '600' } } },
            scales: { y: { beginAtZero: true, grid: { color: '#e2e8f0' } }, x: { grid: { display: false } } }
        }
    });
}

function createDoughnutChart(canvasId, labels, data, title) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const colors = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];
    return new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{ data: data, backgroundColor: colors.slice(0, data.length), borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { padding: 15, font: { size: 11 } } }, title: { display: true, text: title, font: { size: 14, weight: '600' } } }
        }
    });
}

function createLineChart(canvasId, labels, datasets, title) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    return new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: title, font: { size: 14, weight: '600' } } },
            scales: { y: { beginAtZero: true, grid: { color: '#e2e8f0' } }, x: { grid: { color: '#f1f5f9' } } },
            elements: { line: { tension: 0.3 } }
        }
    });
}

function createRadarChart(canvasId, labels, datasets, title) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    return new Chart(ctx.getContext('2d'), {
        type: 'radar',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: title, font: { size: 14, weight: '600' } } },
            scales: { r: { beginAtZero: true, max: 100, grid: { color: '#e2e8f0' } } }
        }
    });
}
