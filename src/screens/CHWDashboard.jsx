// Community Health Worker Dashboard
// CHW can monitor and manage multiple pregnant women in their community
// Frontend: React web app - chw-dashboard/Dashboard.jsx
/* global window, localStorage */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  TextField,
  Alert,
  Dialog,
  IconButton,
  Tabs,
  Tab
} from '@mui/material';
import {
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Call as CallIcon,
  Message as MessageIcon,
  Add as AddIcon,
  Search as SearchIcon
} from '@mui/icons-material';

export default function CHWDashboard() {
  const [chw, setChw] = useState(null);
  const [mothers, setMothers] = useState([]);
  const [filteredMothers, setFilteredMothers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedMother, setSelectedMother] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    highRisk: 0,
    dueThisMonth: 0,
    recentAlerts: 0
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    filterMothers();
  }, [searchTerm, selectedTab, mothers]);

  const loadDashboardData = async () => {
    try {
      // Load CHW profile
      const chwData = await fetchCHWProfile();
      setChw(chwData);

      // Load registered mothers
      const mothersData = await fetchMothers(chwData.id);
      setMothers(mothersData);

      // Calculate statistics
      calculateStats(mothersData);
    } catch (error) {
      console.warn('[CHWDashboard] Failed to load dashboard data:', error?.message || 'unknown error'); // BUG-008: never log error object — may contain PHI from API response
    }
  };

  const calculateStats = (mothersData) => {
    const stats = {
      total: mothersData.length,
      highRisk: mothersData.filter(m => m.riskLevel === 'high').length,
      dueThisMonth: mothersData.filter(m => {
        const dueDate = new Date(m.dueDate);
        const now = new Date();
        return dueDate.getMonth() === now.getMonth() && 
               dueDate.getFullYear() === now.getFullYear();
      }).length,
      recentAlerts: mothersData.filter(m => {
        if (!m.lastAlert) {return false;}
        const alertDate = new Date(m.lastAlert);
        const daysSince = (Date.now() - alertDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince <= 7;
      }).length
    };
    setStats(stats);
  };

  const filterMothers = () => {
    let filtered = mothers;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(m =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.phoneNumber.includes(searchTerm) ||
        m.village?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by tab
    switch (selectedTab) {
      case 1: // High Risk
        filtered = filtered.filter(m => m.riskLevel === 'high');
        break;
      case 2: // Due Soon
        filtered = filtered.filter(m => {
          const daysUntilDue = getDaysUntilDue(m.dueDate);
          return daysUntilDue >= 0 && daysUntilDue <= 30;
        });
        break;
      case 3: // Recent Alerts
        filtered = filtered.filter(m => m.lastAlert);
        break;
    }

    setFilteredMothers(filtered);
  };

  const getDaysUntilDue = (dueDate) => {
    const due = new Date(dueDate);
    const today = new Date();
    const diff = due.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getRiskColor = (riskLevel) => {
    switch (riskLevel) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      default: return 'success';
    }
  };

  const handleCallMother = async (mother) => {
    // Log call in system
    await logCHWActivity({
      type: 'call',
      motherId: mother.id,
      chwId: chw.id,
      timestamp: new Date()
    });

    // Initiate call (mobile integration)
    window.location.href = `tel:${mother.phoneNumber}`;
  };

  const handleSendSMS = async (mother) => {
    setSelectedMother(mother);
    // Open SMS dialog
  };

  const handleRegisterNewMother = () => {
    // Open registration form
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            🤰 MamaCare CHW Dashboard
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Welcome, {chw?.name} - {chw?.village}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleRegisterNewMother}
        >
          Register New Mother
        </Button>
      </Box>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Mothers
              </Typography>
              <Typography variant="h3" fontWeight="bold">
                {stats.total}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#ffebee' }}>
            <CardContent>
              <Typography color="error" gutterBottom>
                High Risk
              </Typography>
              <Typography variant="h3" fontWeight="bold" color="error">
                {stats.highRisk}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#fff3e0' }}>
            <CardContent>
              <Typography color="warning.main" gutterBottom>
                Due This Month
              </Typography>
              <Typography variant="h3" fontWeight="bold" color="warning.main">
                {stats.dueThisMonth}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#e3f2fd' }}>
            <CardContent>
              <Typography color="primary" gutterBottom>
                Recent Alerts
              </Typography>
              <Typography variant="h3" fontWeight="bold" color="primary">
                {stats.recentAlerts}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search and Filter */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField
            fullWidth
            placeholder="Search by name, phone, or village..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
            }}
          />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={selectedTab} onChange={(e, v) => setSelectedTab(v)}>
          <Tab label={`All (${mothers.length})`} />
          <Tab 
            label={`High Risk (${mothers.filter(m => m.riskLevel === 'high').length})`} 
            icon={<WarningIcon />} 
            iconPosition="start"
          />
          <Tab label="Due Soon" />
          <Tab label="Recent Alerts" />
        </Tabs>
      </Box>

      {/* Mothers Table */}
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Age</TableCell>
              <TableCell>Week</TableCell>
              <TableCell>Due Date</TableCell>
              <TableCell>Village</TableCell>
              <TableCell>Risk Level</TableCell>
              <TableCell>Last Contact</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredMothers.map((mother) => (
              <TableRow key={mother.id}>
                <TableCell>
                  <Box>
                    <Typography fontWeight="bold">{mother.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {mother.phoneNumber}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>{mother.age}</TableCell>
                <TableCell>
                  <Chip 
                    label={`Week ${mother.gestationalWeek}`} 
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  <Box>
                    <Typography variant="body2">
                      {new Date(mother.dueDate).toLocaleDateString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {getDaysUntilDue(mother.dueDate)} days
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>{mother.village}</TableCell>
                <TableCell>
                  <Chip
                    label={mother.riskLevel.toUpperCase()}
                    color={getRiskColor(mother.riskLevel)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="caption">
                    {mother.lastContact 
                      ? new Date(mother.lastContact).toLocaleDateString()
                      : 'No contact'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <IconButton 
                      size="small" 
                      color="primary"
                      onClick={() => handleCallMother(mother)}
                    >
                      <CallIcon />
                    </IconButton>
                    <IconButton 
                      size="small" 
                      color="primary"
                      onClick={() => handleSendSMS(mother)}
                    >
                      <MessageIcon />
                    </IconButton>
                    <Button 
                      size="small" 
                      variant="outlined"
                      onClick={() => setSelectedMother(mother)}
                    >
                      Details
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Alerts Section */}
      {stats.recentAlerts > 0 && (
        <Box sx={{ mt: 3 }}>
          <Alert severity="warning">
            <Typography variant="h6" gutterBottom>
              ⚠️ {stats.recentAlerts} Recent Emergency Alerts
            </Typography>
            <Typography variant="body2">
              Please follow up with mothers who have sent emergency alerts in the past 7 days.
            </Typography>
          </Alert>
        </Box>
      )}
    </Box>
  );
}

// API Helper Functions
async function fetchCHWProfile() {
  // Fetch CHW profile from backend
  const response = await fetch('/api/chw/profile', {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('chwToken')}`
    }
  });
  return response.json();
}

async function fetchMothers(chwId) {
  const response = await fetch(`/api/chw/${chwId}/mothers`);
  return response.json();
}

async function logCHWActivity(activity) {
  await fetch('/api/chw/activity', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('chwToken')}`
    },
    body: JSON.stringify(activity)
  });
}

// Export report generation
export function generateCHWReport(mothers, period = 'monthly') {
  const report = {
    period,
    generatedDate: new Date().toISOString(),
    statistics: {
      totalMothers: mothers.length,
      newRegistrations: 0,
      emergencyAlerts: 0,
      hospitalReferrals: 0,
      successfulDeliveries: 0,
      complications: 0,
    },
    riskBreakdown: {
      high: mothers.filter(m => m.riskLevel === 'high').length,
      medium: mothers.filter(m => m.riskLevel === 'medium').length,
      low: mothers.filter(m => m.riskLevel === 'low').length,
    },
    trimesterBreakdown: {
      first: mothers.filter(m => m.gestationalWeek <= 13).length,
      second: mothers.filter(m => m.gestationalWeek > 13 && m.gestationalWeek <= 26).length,
      third: mothers.filter(m => m.gestationalWeek > 26).length,
    }
  };

  return report;
}

// Performance metrics for CHWs
export function calculateCHWPerformance(chw, activities) {
  return {
    homeVisits: activities.filter(a => a.type === 'home_visit').length,
    phoneCheckins: activities.filter(a => a.type === 'call').length,
    emergenciesManaged: activities.filter(a => a.type === 'emergency_response').length,
    referrals: activities.filter(a => a.type === 'hospital_referral').length,
    averageResponseTime: calculateAverageResponseTime(activities),
    motherSatisfactionScore: chw.satisfactionScore || 0,
  };
}

function calculateAverageResponseTime(activities) {
  const emergencies = activities.filter(a => a.type === 'emergency_response');
  if (emergencies.length === 0) {return 0;}

  const totalTime = emergencies.reduce((sum, e) => {
    return sum + (e.responseTime || 0);
  }, 0);

  return Math.round(totalTime / emergencies.length);
}
