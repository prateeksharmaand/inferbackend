/**
 * Lab Portal - OpenELIS-inspired redesign
 */

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Plus, Edit, User, AlertTriangle, FlaskConical,
  FileBarChart, Upload, ClipboardList, GitBranch, BarChart2,
  BookOpen, Bell, ScrollText, TrendingUp, LogOut,
} from 'lucide-react';

import styles from './LabPortal.module.css';
import { DashboardTab } from './DashboardTab';
import { AddSampleTab } from './AddSampleTab';
import { EditSampleTab } from './EditSampleTab';
import { PatientsTab } from './PatientsTab';
import { NonConformityTab } from './NonConformityTab';
import { ResultsTab } from './ResultsTab';
import { ReportsTab } from './ReportsTab';
import { UploadTab } from './UploadTab';
import { OrdersTab } from './OrdersTab';
import { WorkflowTab } from './WorkflowTab';
import { AnalyticsTab } from './AnalyticsTab';
import { CatalogTab } from './CatalogTab';
import { NotificationsTab } from './NotificationsTab';
import { AuditTrailTab } from './AuditTrailTab';
import { TrendsTab } from './TrendsTab';

async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('auth_token')}` };
  const res = await fetch(url, { headers, ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function LabPortal() {
  const labId = localStorage.getItem('lab_id');
  const userEmail = localStorage.getItem('user_email') || 'Lab Staff';
  const labRole = localStorage.getItem('lab_role') || 'LAB_STAFF';
  const userInitial = (userEmail[0] || 'L').toUpperCase();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [facilityName, setFacilityName] = useState('Loading...');

  useEffect(() => {
    apiFetch('/api/v1/labs/status')
      .then((d) => setFacilityName(d.laboratory?.facility_name || 'Infer Lab'))
      .catch(() => setFacilityName('Infer Lab'));
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/lab/login';
  };

  const navItems = [
    { id: 'dashboard',      label: 'Lab Dashboard',   icon: <LayoutDashboard size={16} /> },
    { id: 'add-sample',     label: 'Add Sample',       icon: <Plus size={16} /> },
    { id: 'edit-sample',    label: 'Edit Sample',      icon: <Edit size={16} /> },
    { id: 'patient',        label: 'Patient',          icon: <User size={16} /> },
    { id: 'non-conformity', label: 'Non Conformity',   icon: <AlertTriangle size={16} /> },
    { id: 'results',        label: 'Results',          icon: <FlaskConical size={16} /> },
    { id: 'reports',        label: 'Reports',          icon: <FileBarChart size={16} /> },
    { id: 'upload',         label: 'Upload',           icon: <Upload size={16} /> },
    { id: 'orders',         label: 'Orders',           icon: <ClipboardList size={16} /> },
    { id: 'workflow',       label: 'Workflow',         icon: <GitBranch size={16} /> },
    { id: 'analytics',      label: 'Analytics',        icon: <BarChart2 size={16} /> },
    { id: 'catalog',        label: 'Test Catalog',     icon: <BookOpen size={16} /> },
    { id: 'notifications',  label: 'Notifications',    icon: <Bell size={16} /> },
    { id: 'audit',          label: 'Audit Trail',      icon: <ScrollText size={16} /> },
    { id: 'trends',         label: 'Trend Analysis',   icon: <TrendingUp size={16} /> },
  ];

  const currentNavItem = navItems.find((n) => n.id === activeTab) || navItems[0];

  return (
    <div className={styles.shell}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <div className={styles.sidebarLogoIcon}><FlaskConical size={20} /></div>
          <div>
            <div className={styles.sidebarLogoName}>Infer Lab</div>
            <div className={styles.sidebarLogoSub}>{facilityName}</div>
          </div>
        </div>
        <nav className={styles.sidebarNav}>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`${styles.navItem} ${activeTab === item.id ? styles.active : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            <LogOut size={15} /> Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className={styles.main}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <div>
            <div className={styles.topbarTitle}>{currentNavItem.label}</div>
            <div className={styles.topbarFacility}>{facilityName}</div>
          </div>
          <div className={styles.topbarRight}>
            <div className={styles.userChip}>
              <div className={styles.userAvatar}>{userInitial}</div>
              <span>{userEmail}</span>
              <span className={styles.roleBadge}>{labRole}</span>
            </div>
          </div>
        </header>

        {/* Tab content */}
        <main
          className={styles.content}
          style={activeTab === 'reports' ? { padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' } : undefined}
        >
          {activeTab === 'dashboard'      && <DashboardTab labId={labId} styles={styles} />}
          {activeTab === 'add-sample'     && <AddSampleTab labId={labId} styles={styles} />}
          {activeTab === 'edit-sample'    && <EditSampleTab labId={labId} styles={styles} />}
          {activeTab === 'patient'        && <PatientsTab labId={labId} styles={styles} />}
          {activeTab === 'non-conformity' && <NonConformityTab labId={labId} styles={styles} />}
          {activeTab === 'results'        && <ResultsTab labId={labId} styles={styles} />}
          {activeTab === 'reports'        && <ReportsTab labId={labId} styles={styles} />}
          {activeTab === 'upload'         && <UploadTab labId={labId} styles={styles} />}
          {activeTab === 'orders'         && <OrdersTab labId={labId} styles={styles} />}
          {activeTab === 'workflow'       && <WorkflowTab labId={labId} styles={styles} />}
          {activeTab === 'analytics'      && <AnalyticsTab labId={labId} styles={styles} />}
          {activeTab === 'catalog'        && <CatalogTab labId={labId} styles={styles} />}
          {activeTab === 'notifications'  && <NotificationsTab labId={labId} styles={styles} />}
          {activeTab === 'audit'          && <AuditTrailTab labId={labId} styles={styles} />}
          {activeTab === 'trends'         && <TrendsTab labId={labId} styles={styles} />}
        </main>
      </div>
    </div>
  );
}

export default LabPortal;
