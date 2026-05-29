import React from 'react';
import { View, Text, ScrollView } from 'react-native';

class ErrorBoundary extends React.Component {
  state = { error: null };
  componentDidCatch(error) {
    this.setState({ error: error.toString() });
  }
  render() {
    if (this.state.error) {
      return (
        <ScrollView style={{ flex:1, padding:20, marginTop:50 }}>
          <Text style={{ color:'red', fontSize:16, fontWeight:'bold' }}>
            CRASH DETAILS:
          </Text>
          <Text style={{ color:'red', fontSize:13, marginTop:10 }}>
            {this.state.error}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

// Import your real app
import RealApp from './App.backup';

export default function App() {
  return (
    <ErrorBoundary>
      <RealApp />
    </ErrorBoundary>
  );
}
EOFcat > App.js << 'EOF'
import React from 'react';
import { View, Text, ScrollView } from 'react-native';

class ErrorBoundary extends React.Component {
  state = { error: null };
  componentDidCatch(error) {
    this.setState({ error: error.toString() });
  }
  render() {
    if (this.state.error) {
      r<RealApp />
  </ErrorBoundary>
);
}
