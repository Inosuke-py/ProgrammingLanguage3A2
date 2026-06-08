from django.urls import path
from . import views

urlpatterns = [
    path('', views.dashboard, name='home'),
    path('dashboard/', views.dashboard, name='dashboard'),
    path('code-input/', views.code_input, name='code_input'),
    path('submissions/', views.submissions_list, name='submissions_list'),
    path('reports/', views.reports_list, name='reports_list'),
    path('report/<int:pk>/', views.report_detail, name='report_detail'),
    path('submission/<int:pk>/delete/', views.delete_submission, name='delete_submission'),
    path('analysis/<int:pk>/select/', views.analysis_select, name='analysis_select'),
    path('analysis/<int:pk>/bytecode/', views.bytecode_analysis, name='bytecode_analysis'),
    path('analysis/<int:pk>/caching/', views.caching_analysis, name='caching_analysis'),
    path('analysis/<int:pk>/optimization/', views.optimization_analysis, name='optimization_analysis'),
    path('analysis/<int:pk>/hotpath/', views.hotpath_analysis, name='hotpath_analysis'),
    path('analysis/<int:pk>/runtime/', views.runtime_analysis, name='runtime_analysis'),
    path('analysis/<int:pk>/concurrency/', views.concurrency_analysis, name='concurrency_analysis'),
    path('analysis/<int:pk>/memory/', views.memory_analysis, name='memory_analysis'),
    path('suitability/', views.suitability_analysis, name='suitability_analysis'),
]
