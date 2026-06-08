"""Application suitability recommendation engine."""

# Language database with detailed scoring
LANGUAGE_DATABASE = {
    'Python': {
        'runtime_efficiency': 45,
        'memory_overhead': 40,
        'concurrency_support': 55,
        'scalability': 65,
        'ecosystem_maturity': 95,
        'development_speed': 95,
        'domains': {
            'web_development': 88,
            'ai_ml': 98,
            'mobile_development': 30,
            'systems_programming': 20,
            'embedded_systems': 25,
            'game_development': 40,
            'scientific_computing': 92,
        },
        'description': 'High-level, interpreted language with extensive libraries. Excellent for rapid development, AI/ML, and scientific computing.',
        'strengths': ['Rapid prototyping', 'Rich ecosystem', 'AI/ML libraries', 'Readability'],
        'weaknesses': ['Slow execution', 'GIL limitations', 'High memory usage'],
    },
    'JavaScript': {
        'runtime_efficiency': 60,
        'memory_overhead': 55,
        'concurrency_support': 75,
        'scalability': 80,
        'ecosystem_maturity': 92,
        'development_speed': 88,
        'domains': {
            'web_development': 98,
            'ai_ml': 50,
            'mobile_development': 82,
            'systems_programming': 15,
            'embedded_systems': 30,
            'game_development': 55,
            'scientific_computing': 35,
        },
        'description': 'Dynamic language dominating web development. Event-driven, non-blocking I/O with Node.js.',
        'strengths': ['Web ubiquity', 'Async I/O', 'Huge ecosystem', 'Full-stack capability'],
        'weaknesses': ['Type coercion issues', 'Single-threaded', 'Memory management'],
    },
    'Java': {
        'runtime_efficiency': 75,
        'memory_overhead': 50,
        'concurrency_support': 85,
        'scalability': 92,
        'ecosystem_maturity': 95,
        'development_speed': 60,
        'domains': {
            'web_development': 80,
            'ai_ml': 55,
            'mobile_development': 85,
            'systems_programming': 40,
            'embedded_systems': 45,
            'game_development': 50,
            'scientific_computing': 55,
        },
        'description': 'Statically typed, compiled to bytecode. Enterprise-grade with robust concurrency and scalability.',
        'strengths': ['Platform independence', 'Strong typing', 'Enterprise ecosystem', 'Concurrency'],
        'weaknesses': ['Verbose syntax', 'Slow startup', 'High memory footprint'],
    },
    'C++': {
        'runtime_efficiency': 97,
        'memory_overhead': 92,
        'concurrency_support': 85,
        'scalability': 80,
        'ecosystem_maturity': 90,
        'development_speed': 30,
        'domains': {
            'web_development': 20,
            'ai_ml': 65,
            'mobile_development': 45,
            'systems_programming': 95,
            'embedded_systems': 90,
            'game_development': 98,
            'scientific_computing': 88,
        },
        'description': 'High-performance compiled language with manual memory control. Ideal for systems and games.',
        'strengths': ['Raw performance', 'Memory control', 'Hardware access', 'Zero-cost abstractions'],
        'weaknesses': ['Complex syntax', 'Memory safety issues', 'Long compile times'],
    },
    'Rust': {
        'runtime_efficiency': 96,
        'memory_overhead': 95,
        'concurrency_support': 92,
        'scalability': 88,
        'ecosystem_maturity': 65,
        'development_speed': 40,
        'domains': {
            'web_development': 55,
            'ai_ml': 40,
            'mobile_development': 35,
            'systems_programming': 98,
            'embedded_systems': 92,
            'game_development': 80,
            'scientific_computing': 72,
        },
        'description': 'Memory-safe systems language with zero-cost abstractions and fearless concurrency.',
        'strengths': ['Memory safety', 'Concurrency safety', 'Performance', 'No garbage collector'],
        'weaknesses': ['Steep learning curve', 'Smaller ecosystem', 'Longer development time'],
    },
    'Go': {
        'runtime_efficiency': 80,
        'memory_overhead': 75,
        'concurrency_support': 95,
        'scalability': 92,
        'ecosystem_maturity': 72,
        'development_speed': 78,
        'domains': {
            'web_development': 78,
            'ai_ml': 30,
            'mobile_development': 30,
            'systems_programming': 75,
            'embedded_systems': 40,
            'game_development': 25,
            'scientific_computing': 35,
        },
        'description': 'Compiled language designed for simplicity and concurrency. Excellent for microservices and cloud.',
        'strengths': ['Goroutines', 'Fast compilation', 'Simple syntax', 'Built-in concurrency'],
        'weaknesses': ['No generics (improving)', 'Limited OOP', 'Smaller ecosystem'],
    },
    'C#': {
        'runtime_efficiency': 78,
        'memory_overhead': 60,
        'concurrency_support': 85,
        'scalability': 85,
        'ecosystem_maturity': 88,
        'development_speed': 72,
        'domains': {
            'web_development': 78,
            'ai_ml': 45,
            'mobile_development': 75,
            'systems_programming': 45,
            'embedded_systems': 35,
            'game_development': 92,
            'scientific_computing': 50,
        },
        'description': 'Modern, object-oriented language with strong .NET ecosystem. Popular for games (Unity) and enterprise.',
        'strengths': ['Unity engine', '.NET ecosystem', 'LINQ', 'Async/await'],
        'weaknesses': ['Platform dependency (improving)', '.NET framework overhead', 'Less open-source historically'],
    },
    'Swift': {
        'runtime_efficiency': 82,
        'memory_overhead': 78,
        'concurrency_support': 75,
        'scalability': 70,
        'ecosystem_maturity': 68,
        'development_speed': 75,
        'domains': {
            'web_development': 35,
            'ai_ml': 45,
            'mobile_development': 95,
            'systems_programming': 55,
            'embedded_systems': 40,
            'game_development': 60,
            'scientific_computing': 40,
        },
        'description': 'Apple\'s modern language for iOS/macOS development. Safe, fast, and expressive.',
        'strengths': ['iOS native', 'Memory safety', 'Modern syntax', 'Performance'],
        'weaknesses': ['Apple ecosystem lock-in', 'Smaller community', 'ABI stability concerns'],
    },
}

DOMAIN_LABELS = {
    'web_development': 'Web Development',
    'ai_ml': 'AI / Machine Learning',
    'mobile_development': 'Mobile Development',
    'systems_programming': 'Systems Programming',
    'embedded_systems': 'Embedded Systems',
    'game_development': 'Game Development',
    'scientific_computing': 'Scientific Computing',
}

CRITERIA_LABELS = {
    'runtime_efficiency': 'Runtime Efficiency',
    'memory_overhead': 'Memory Efficiency',
    'concurrency_support': 'Concurrency Support',
    'scalability': 'Scalability',
    'ecosystem_maturity': 'Ecosystem Maturity',
    'development_speed': 'Development Speed',
}


def get_recommendations(domain=None, weights=None):
    """Generate language recommendations for a specific domain."""
    if weights is None:
        weights = {k: 1.0 for k in CRITERIA_LABELS}

    result = {
        'rankings': [],
        'domain': domain,
        'domain_label': DOMAIN_LABELS.get(domain, 'General Purpose'),
        'radar_data': {},
        'explanations': [],
    }

    scored_languages = []
    for lang_name, lang_data in LANGUAGE_DATABASE.items():
        # Calculate weighted score
        criteria_score = 0
        total_weight = 0
        for criteria, weight in weights.items():
            if criteria in lang_data:
                criteria_score += lang_data[criteria] * weight
                total_weight += weight

        criteria_avg = criteria_score / max(total_weight, 1)

        # Domain-specific score
        domain_score = lang_data['domains'].get(domain, 50) if domain else criteria_avg

        # Combined score (60% domain, 40% criteria)
        if domain:
            final_score = domain_score * 0.6 + criteria_avg * 0.4
        else:
            final_score = criteria_avg

        scored_languages.append({
            'name': lang_name,
            'score': round(final_score, 1),
            'domain_score': domain_score,
            'criteria_scores': {k: lang_data.get(k, 0) for k in CRITERIA_LABELS},
            'description': lang_data['description'],
            'strengths': lang_data['strengths'],
            'weaknesses': lang_data['weaknesses'],
        })

    # Sort by score
    scored_languages.sort(key=lambda x: x['score'], reverse=True)

    # Assign ranks
    for i, lang in enumerate(scored_languages):
        lang['rank'] = i + 1
        if lang['score'] >= 80:
            lang['tier'] = 'Highly Recommended'
            lang['badge'] = 'success'
        elif lang['score'] >= 60:
            lang['tier'] = 'Recommended'
            lang['badge'] = 'info'
        elif lang['score'] >= 40:
            lang['tier'] = 'Suitable'
            lang['badge'] = 'warning'
        else:
            lang['tier'] = 'Not Recommended'
            lang['badge'] = 'danger'

    result['rankings'] = scored_languages

    # Radar chart data
    result['radar_data'] = {
        lang_name: {k: lang_data.get(k, 0) for k in CRITERIA_LABELS}
        for lang_name, lang_data in LANGUAGE_DATABASE.items()
    }

    # Generate explanations
    if scored_languages:
        best = scored_languages[0]
        result['explanations'] = [
            {
                'title': f"Top Pick: {best['name']}",
                'text': f"{best['name']} scores {best['score']}/100 for {result['domain_label']}. {best['description']}",
                'type': 'primary',
            },
            {
                'title': 'Key Strengths',
                'text': f"Primary advantages: {', '.join(best['strengths'])}",
                'type': 'success',
            },
            {
                'title': 'Considerations',
                'text': f"Be aware of: {', '.join(best['weaknesses'])}",
                'type': 'warning',
            },
        ]
        if len(scored_languages) > 1:
            runner = scored_languages[1]
            result['explanations'].append({
                'title': f"Runner-up: {runner['name']}",
                'text': f"{runner['name']} is a strong alternative with a score of {runner['score']}/100. {runner['description']}",
                'type': 'info',
            })

    return result


def get_all_domain_rankings():
    """Get top language for each domain."""
    domain_rankings = {}
    for domain_key, domain_label in DOMAIN_LABELS.items():
        rec = get_recommendations(domain=domain_key)
        if rec['rankings']:
            domain_rankings[domain_label] = {
                'best': rec['rankings'][0]['name'],
                'score': rec['rankings'][0]['score'],
                'top_3': [(r['name'], r['score']) for r in rec['rankings'][:3]],
            }
    return domain_rankings
