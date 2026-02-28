import { useEffect } from 'react';
import './App.css';

import { fetchAuthSession } from 'aws-amplify/auth';

async function getGuestUserId() {
  try {
    const session = await fetchAuthSession();
    console.log({ session });
  } catch (error) {
    console.error('Error fetching guest session:', error);
  }
}

function App() {
  useEffect(() => {
    getGuestUserId();
  }, []);

  return <>123</>;
}

export default App;
